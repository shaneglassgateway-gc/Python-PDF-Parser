import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface EagleViewData {
  roofArea: number
  eavesLength: number
  rakesLength: number
  valleysLength: number
  hipsLength: number
  ridgesLength: number
  pitch: number
  stories: number
  hasTrailerAccess: boolean
  hasSecondLayer: boolean
  lowPitchArea: number
}

interface JobDetails {
  customerName: string
  customerAddress: string
  projectType: string
  notes: string
}

export default function Upload() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [eagleViewData, setEagleViewData] = useState<EagleViewData | null>(null)
  const [jobDetails, setJobDetails] = useState<JobDetails>({
    customerName: '',
    customerAddress: '',
    projectType: 'residential',
    notes: ''
  })

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    setError(null)
    setSuccess(false)
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file')
      return
    }
    
    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB')
      return
    }

    setUploading(true)
    
    try {
      // Upload file to server
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/estimates/parse-eagleview', {
        method: 'POST',
        body: formData
      })
      
      let result: any = null
      try {
        result = await response.json()
      } catch {}
      
      if (!response.ok || !result?.success) {
        const msg = result?.error || 'Failed to parse EagleView file'
        const det = result?.detail ? `: ${result.detail}` : ''
        throw new Error(`${msg}${det}`)
      }
      
      setEagleViewData(result.data)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!eagleViewData) {
      setError('Please upload and parse an EagleView file first')
      return
    }
    
    if (!jobDetails.customerName.trim() || !jobDetails.customerAddress.trim()) {
      setError('Please fill in customer name and address')
      return
    }
    
    setParsing(true)
    setError(null)
    
    try {
      // Get the current user session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('You must be logged in to create estimates')
      }
      
      // Create estimate data
      const estimateData = {
        customer_name: jobDetails.customerName,
        customer_address: jobDetails.customerAddress,
        project_type: jobDetails.projectType,
        notes: jobDetails.notes,
        eagleview_data: eagleViewData,
        roof_measurements: eagleViewData,
        status: 'draft'
      }
      
      // Create the estimate
      const response = await fetch('/api/estimates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(estimateData)
      })
      
      if (!response.ok) {
        throw new Error('Failed to create estimate')
      }
      
      const result = await response.json()
      
      // Navigate to the estimate page
      navigate(`/estimate/${result.estimate.id}`)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Estimate</h1>
          <p className="text-gray-600">Upload an EagleView report to get started</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* File Upload Section */}
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload EagleView Report</h2>
            
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileInput}
                className="hidden"
                disabled={uploading || parsing}
              />
              
              {uploading ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Uploading and parsing EagleView file...</p>
                </div>
              ) : success ? (
                <div className="flex flex-col items-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
                  <p className="text-green-600 font-medium">EagleView file parsed successfully!</p>
                  {eagleViewData && (
                    <div className="mt-4 text-sm text-gray-600">
                      <p>Roof Area: {eagleViewData.roofArea.toFixed(1)} squares</p>
                      <p>Pitch: {eagleViewData.pitch.toFixed(2)}</p>
                      <p>Stories: {eagleViewData.stories}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">
                    Drag and drop your EagleView PDF here, or{' '}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                      disabled={uploading || parsing}
                    >
                      browse to select a file
                    </button>
                  </p>
                  <p className="text-sm text-gray-500">Maximum file size: 50MB</p>
                </div>
              )}
            </div>
            
            {error && (
              <div className="mt-4 flex items-center text-red-600">
                <AlertCircle className="h-4 w-4 mr-2" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>

          {/* Job Details Form */}
          {eagleViewData && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      id="customerName"
                      value={jobDetails.customerName}
                      onChange={(e) => setJobDetails(prev => ({ ...prev, customerName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={parsing}
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="projectType" className="block text-sm font-medium text-gray-700 mb-1">
                      Project Type
                    </label>
                    <select
                      id="projectType"
                      value={jobDetails.projectType}
                      onChange={(e) => setJobDetails(prev => ({ ...prev, projectType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={parsing}
                    >
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                      <option value="multi-family">Multi-Family</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="customerAddress" className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Address *
                  </label>
                  <input
                    type="text"
                    id="customerAddress"
                    value={jobDetails.customerAddress}
                    onChange={(e) => setJobDetails(prev => ({ ...prev, customerAddress: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={parsing}
                  />
                </div>
                
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    value={jobDetails.notes}
                    onChange={(e) => setJobDetails(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional project notes..."
                    disabled={parsing}
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEagleViewData(null)
                      setSuccess(false)
                      setError(null)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={parsing}
                  >
                    Upload Different File
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={parsing}
                  >
                    {parsing ? (
                      <span className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating Estimate...
                      </span>
                    ) : (
                      'Create Estimate'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
