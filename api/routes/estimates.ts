import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const router = Router()

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
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ 
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') },
  fileFilter: (req, file, cb) => {
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

    const parseUrl = process.env.PYTHON_PARSE_URL || 'http://127.0.0.1:8001/parse'
    if (parseUrl) {
      try {
        const buffer = fs.readFileSync(filePath)
        const resp = await fetch(parseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: buffer
        })
        const remote = await resp.json()
        if (!resp.ok || !remote?.success) {
          throw new Error(remote?.detail || `Remote parse failed: ${resp.status}`)
        }
        parsedData = remote.data
      } catch (err) {
        lastError = err
      }
    }

    const pythonCmd = parsedData ? null : await resolvePython()
    
    
    if (pythonCmd) {
      try {
        const { stdout, stderr } = await execAsync(`${pythonCmd} eagleview_parser.py "${filePath}"`)
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
        const result = await resp.json()
        parsedData = result.data ?? result
      } catch (err) {
        lastError = err
      }
    }

    if (!parsedData) {
      console.error('Parse error:', lastError)
      return res.status(500).json({ error: 'Failed to parse EagleView file', detail: String(lastError) })
    }

    // Transform to frontend shape
    const roof = parsedData?.roof_measurements || {}
    const breakdown = parsedData?.pitch_breakdown || []
    const lowPitchSq = Array.isArray(breakdown)
      ? breakdown
          .filter((p: any) => {
            const m = String(p.pitch || '').match(/(\d+)\/(\d+)/)
            if (!m) return false
            const num = parseFloat(m[1])
            const den = parseFloat(m[2] || '12') || 12
            return (num/den) <= (2/12)
          })
          .reduce((sum: number, p: any) => sum + (parseFloat(p.area_sqft || p.area || 0) / 100), 0)
      : 0

    const pitchStr = roof.predominant_pitch || ''
    const m = String(pitchStr).match(/(\d+)\/(\d+)/)
    const pitchRatio = m ? (parseFloat(m[1]) / (parseFloat(m[2]) || 12)) : 0
    const storiesNum = roof.num_stories ? parseInt(String(roof.num_stories).replace(/[^0-9]/g, '') || '1', 10) : 1
    const suggestedWaste = parsedData?.suggested_waste || null
    const wasteSquares = suggestedWaste ? parseFloat(suggestedWaste.squares || 0) || 0 : 0

    const pitchBreakdown = Array.isArray(breakdown)
      ? breakdown.map((p: any) => ({
          pitch: String(p.pitch || ''),
          squares: (parseFloat(p.area_sqft || p.area || 0) / 100) || 0,
        }))
      : []

    const mapped = {
      roofArea: (parseFloat(roof.total_area_sqft || roof.total_area || 0) / 100) || 0,
      roofAreaRounded: Math.ceil(wasteSquares || (parseFloat(roof.total_area_sqft || 0) / 100)) || 0,
      wasteSquares,
      eavesLength: parseFloat(roof.eaves_ft || 0) || 0,
      rakesLength: parseFloat(roof.rakes_ft || 0) || 0,
      valleysLength: parseFloat(roof.valleys_ft || 0) || 0,
      hipsLength: parseFloat(roof.hips_ft || 0) || 0,
      ridgesLength: parseFloat(roof.ridges_ft || 0) || 0,
      pitch: pitchRatio || 0,
      stories: storiesNum || 1,
      hasTrailerAccess: false,
      hasSecondLayer: false,
      hasRidgeVent: false,
      thirdStory: false,
      handLoadMaterials: false,
      lowPitchArea: lowPitchSq || 0,
      pitchBreakdown,
    }

    // Clean up uploaded file
    try { fs.unlinkSync(filePath) } catch {}
    
    res.json({ success: true, data: mapped, message: 'EagleView file parsed successfully' })
  } catch (error) {
    console.error('Parse error:', error)
    res.status(500).json({ error: 'Failed to parse EagleView file' })
  }
})

// Get all estimates for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  try {
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

    res.json({ estimates: data })
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

    res.json({ estimate: data })
  } catch (error) {
    console.error('Error fetching estimate:', error)
    res.status(500).json({ error: 'Failed to fetch estimate' })
  }
})

// Create a new estimate
router.post('/', async (req: Request, res: Response) => {
  try {
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

// (moved earlier) specific pricing/rate routes

export default router
