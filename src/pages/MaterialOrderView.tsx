import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiBase } from '../lib/utils'
import { ArrowLeft, Printer, Download } from 'lucide-react'

interface MaterialOrder {
  id: string
  user_id: string
  po_name: string
  address: string
  estimator_name: string
  estimator_email: string
  items: Array<{
    id: string
    itemName: string
    unitOfMeasure: string
    quantity: number
    pricePerUnit: number
    totalCost: number
    color?: string | null
  }>
  total_cost: number
  status: string
  created_at: string
}

export default function MaterialOrderView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<MaterialOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError('You must be logged in to view material orders')
          return
        }
        const resp = await fetch(`${apiBase()}/api/material-orders/${id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        if (!resp.ok) {
          const msg = await resp.text()
          throw new Error(msg || 'Failed to load material order')
        }
        const result = await resp.json()
        setOrder(result.materialOrder)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load material order')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const fmtMoney = (n?: number) => `$${Number(n || 0).toFixed(2)}`

  const handlePrint = () => window.print()
  const handleDownload = () => window.print()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading material order...</p>
        </div>
      </div>
    )
  }
  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Order</h2>
          <p className="text-gray-600 mb-4">{error || 'Material order not found'}</p>
          <button onClick={() => navigate('/history')} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Back to History
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/history')} className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </button>
          <div className="flex space-x-2">
            <button onClick={handlePrint} className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </button>
            <button onClick={handleDownload} className="flex items-center px-3 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600">PO Name</div>
              <div className="font-medium text-gray-900">{order.po_name || '(unnamed)'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Address</div>
              <div className="font-medium text-gray-900">{order.address || ''}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Estimator</div>
              <div className="font-medium text-gray-900">{order.estimator_name || ''}</div>
              <div className="text-sm text-gray-600">{order.estimator_email || ''}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Color</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {order.items.map((it) => (
                  <tr key={`${it.id}-${it.itemName}`}>
                    <td className="px-4 py-2 text-sm text-gray-700">{it.itemName}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{it.unitOfMeasure}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-right">{it.quantity}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-right">{fmtMoney(it.pricePerUnit)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-right">{fmtMoney(it.totalCost)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{it.color || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900" colSpan={4}>Order Total</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{fmtMoney(order.total_cost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
