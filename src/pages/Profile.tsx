import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle } from 'lucide-react'

export default function Profile() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user as any
      setEmail(user?.email || '')
      const fn = user?.user_metadata?.first_name || ''
      const ln = user?.user_metadata?.last_name || ''
      setFirstName(fn)
      setLastName(ln)
    })
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const fullName = `${firstName || ''} ${lastName || ''}`.trim()
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName || '',
          last_name: lastName || '',
          full_name: fullName
        }
      })
      if (error) throw error
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
            <p className="text-sm text-gray-600">Update your name used on material orders</p>
          </div>
          <form onSubmit={save} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input type="text" value={firstName} onChange={(e)=>setFirstName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input type="text" value={lastName} onChange={(e)=>setLastName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            {error && (
              <div className="mt-2 flex items-center text-red-600 text-sm">
                <AlertCircle className="h-4 w-4 mr-2" />
                <span>{error}</span>
              </div>
            )}
            {success && !error && (
              <div className="mt-2 flex items-center text-green-600 text-sm">
                <CheckCircle className="h-4 w-4 mr-2" />
                <span>Profile updated</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
