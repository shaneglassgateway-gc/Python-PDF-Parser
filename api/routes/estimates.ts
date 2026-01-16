import { Router } from 'express'
import type { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const router = Router()
const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'
const DEV_STORE = path.resolve(process.cwd(), 'uploads', 'dev-estimates.json')
function devReadAll(): any[] {
  try {
    if (!fs.existsSync(DEV_STORE)) return []
    const txt = fs.readFileSync(DEV_STORE, 'utf-8')
    return txt ? JSON.parse(txt) : []
  } catch { return [] }
}
function devWriteAll(items: any[]) {
  try {
    const dir = path.dirname(DEV_STORE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(DEV_STORE, JSON.stringify(items, null, 2), 'utf-8')
  } catch {}
}

async function resolvePython(): Promise<string | null> {
  const cmds = ['py -3', 'python3', 'python']
  for (const cmd of cmds) {
    try {
      await execAsync(`${cmd} --version`)
      return cmd
    } catch {}
  }
  return null
}

// Supabase client for backend operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ 
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') },
  fileFilter: (req: Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  }
})

// Parse EagleView PDF
router.post('/parse-eagleview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const filePath = file.path

    let parsedData: any = null
    let lastError: any = null

    const pythonCmd = await resolvePython()
    if (pythonCmd) {
      try {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        const scriptPath = path.resolve(__dirname, '../../EagleView_Parser2.py')
        const { stdout, stderr } = await execAsync(`${pythonCmd} "${scriptPath}" "${filePath}"`)
        if (stderr) {
          console.warn('Parser warnings:', stderr)
        }
        const start = stdout.indexOf('{')
        const end = stdout.lastIndexOf('}')
        const jsonText = start !== -1 && end !== -1 ? stdout.slice(start, end + 1) : stdout
        parsedData = JSON.parse(jsonText)
      } catch (err) {
        lastError = err
      }
    }

    if (!parsedData && process.env.PYTHON_PARSE_URL) {
      try {
        const buffer = fs.readFileSync(filePath)
        const resp = await fetch(process.env.PYTHON_PARSE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: buffer
        })
        if (!resp.ok) {
          throw new Error(`Remote parse failed: ${resp.status}`)
        }
        const result: any = await resp.json()
        parsedData = result.data ?? result
      } catch (err) {
        lastError = err
      }
    }

    if (!parsedData) {
      console.error('Parse error:', lastError)
      return res.status(500).json({ error: 'Failed to parse EagleView file', detail: String(lastError) })
    }

    // Clean up uploaded file
    try { fs.unlinkSync(filePath) } catch {}
    
    // Return raw parser output for the frontend to decide structure usage
    res.json({ success: true, data: parsedData, message: 'EagleView file parsed successfully' })
  } catch (error) {
    console.error('Parse error:', error)
    res.status(500).json({ error: 'Failed to parse EagleView file' })
  }
})

// Get all estimates for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  try {
    if (DEV_NO_AUTH) {
      return res.json({ estimates: devReadAll() })
    }
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { data, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const isAdmin = (user as any)?.user_metadata?.role === 'admin'
    const sanitized = (data || []).map((d: any) => {
      if (isAdmin) return d
      const items = Array.isArray(d.material_costs) ? d.material_costs.map((m: any) => ({
        ...m,
        pricePerUnit: 0,
        totalCost: 0,
      })) : []
      return { ...d, material_costs: items }
    })
    res.json({ estimates: sanitized })
  } catch (error) {
    console.error('Error fetching estimates:', error)
    res.status(500).json({ error: 'Failed to fetch estimates' })
  }
})

// Public: material pricing
router.get('/material-prices', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('material_prices')
      .select('*')
      .eq('is_active', true)
      .order('category')

    if (error) {
      throw error
    }

    res.json({ materialPrices: data })
  } catch (error) {
    console.error('Error fetching material prices:', error)
    res.status(500).json({ error: 'Failed to fetch material prices' })
  }
})

// Public: labor rates
router.get('/labor-rates', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('labor_rates')
      .select('*')
      .eq('is_active', true)
      .order('condition_type')

    if (error) {
      throw error
    }

    res.json({ laborRates: data })
  } catch (error) {
    console.error('Error fetching labor rates:', error)
    res.status(500).json({ error: 'Failed to fetch labor rates' })
  }
})

// Public: material order rules
router.get('/material-order-rules', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('material_order_rules')
      .select('*')
      .eq('is_active', true)
      .order('category')

    if (error) {
      throw error
    }

    res.json({ materialOrderRules: data })
  } catch (error) {
    console.error('Error fetching material order rules:', error)
    res.status(500).json({ error: 'Failed to fetch material order rules' })
  }
})

// Get a single estimate
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (DEV_NO_AUTH) {
      const all = devReadAll()
      const item = all.find((e: any) => String(e.id) === String(req.params.id))
      if (!item) return res.status(404).json({ error: 'Estimate not found' })
      return res.json({ estimate: item })
    }
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { id } = req.params
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { data, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      throw error
    }

    if (!data) {
      return res.status(404).json({ error: 'Estimate not found' })
    }

    const isAdmin = (user as any)?.user_metadata?.role === 'admin'
    const est = isAdmin ? data : {
      ...data,
      material_costs: Array.isArray(data.material_costs) ? data.material_costs.map((m: any) => ({
        ...m,
        pricePerUnit: 0,
        totalCost: 0,
      })) : []
    }
    res.json({ estimate: est })
  } catch (error) {
    console.error('Error fetching estimate:', error)
    res.status(500).json({ error: 'Failed to fetch estimate' })
  }
})

// Create a new estimate
router.post('/', async (req: Request, res: Response) => {
  try {
    if (DEV_NO_AUTH) {
      const all = devReadAll()
      const id = `${Date.now()}-${Math.floor(Math.random()*1e6)}`
      const item = { id, status: 'draft', ...req.body }
      all.unshift(item)
      devWriteAll(all)
      return res.json({ estimate: item })
    }
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const estimateData = {
      ...req.body,
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('estimates')
      .insert(estimateData)
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({ estimate: data })
  } catch (error) {
    console.error('Error creating estimate:', error)
    res.status(500).json({ error: 'Failed to create estimate' })
  }
})

// Update an estimate
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (DEV_NO_AUTH) {
      const all = devReadAll()
      const idx = all.findIndex((e: any) => String(e.id) === String(req.params.id))
      if (idx === -1) return res.status(404).json({ error: 'Estimate not found' })
      const updated = { ...all[idx], ...req.body }
      all[idx] = updated
      devWriteAll(all)
      return res.json({ estimate: updated })
    }
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { id } = req.params
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    if (!data) {
      return res.status(404).json({ error: 'Estimate not found' })
    }

    res.json({ estimate: data })
  } catch (error) {
    console.error('Error updating estimate:', error)
    res.status(500).json({ error: 'Failed to update estimate' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (DEV_NO_AUTH) {
      const all = devReadAll()
      const after = all.filter((e: any) => String(e.id) !== String(req.params.id))
      devWriteAll(after)
      return res.json({ success: true })
    }
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    const { id } = req.params
    const { error } = await supabase
      .from('estimates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      throw error
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting estimate:', error)
    res.status(500).json({ error: 'Failed to delete estimate' })
  }
})
// (moved earlier) specific pricing/rate routes

export default router
