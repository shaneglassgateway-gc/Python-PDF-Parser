import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    const { data, error } = await supabase
      .from('material_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ materialOrders: data || [] })
  } catch (error) {
    console.error('Error fetching material orders:', error)
    res.status(500).json({ error: 'Failed to fetch material orders' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    const now = new Date().toISOString()
    const payload = {
      user_id: user.id,
      po_name: req.body.po_name || '',
      address: req.body.address || '',
      estimator_name: req.body.estimator_name || '',
      estimator_email: req.body.estimator_email || '',
      items: req.body.items || [],
      total_cost: req.body.total_cost || 0,
      created_at: now,
      updated_at: now,
      status: req.body.status || 'draft'
    }
    const { data, error } = await supabase
      .from('material_orders')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    res.json({ materialOrder: data })
  } catch (error) {
    console.error('Error creating material order:', error)
    res.status(500).json({ error: 'Failed to create material order' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
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
      .from('material_orders')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting material order:', error)
    res.status(500).json({ error: 'Failed to delete material order' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
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
    const { data, error } = await supabase
      .from('material_orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Material order not found' })
    res.json({ materialOrder: data })
  } catch (error) {
    console.error('Error fetching material order:', error)
    res.status(500).json({ error: 'Failed to fetch material order' })
  }
})

router.patch('/:id', async (req: Request, res: Response) => {
  try {
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
    const now = new Date().toISOString()
    const payload = {
      po_name: req.body.po_name ?? undefined,
      address: req.body.address ?? undefined,
      estimator_name: req.body.estimator_name ?? undefined,
      estimator_email: req.body.estimator_email ?? undefined,
      items: req.body.items ?? undefined,
      total_cost: req.body.total_cost ?? undefined,
      status: req.body.status ?? undefined,
      updated_at: now
    }
    const { data, error } = await supabase
      .from('material_orders')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error
    res.json({ materialOrder: data })
  } catch (error) {
    console.error('Error updating material order:', error)
    res.status(500).json({ error: 'Failed to update material order' })
  }
})

export default router
