import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { getStructure1Measurements, getCombinedMeasurements, getSelectedMeasurements } from '../../eagleview-types'
import { supabase } from '../lib/supabase'
import { apiBase } from '../lib/utils'

type EagleViewData = any

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
  const [financed, setFinanced] = useState(false)
  const [options, setOptions] = useState({
    noTrailerAccess: false,
    ridgeVent: false,
    thirdStory: false,
    secondLayer: false,
    handLoadMaterials: false,
  })
  const [includeStructure2, setIncludeStructure2] = useState(false)
  const [includeStructure3, setIncludeStructure3] = useState(false)
  const [accessories, setAccessories] = useState({
    leadBootsQty: 0,
    pvcBootsQty: 0,
    turtleVentsQty: 0,
    rainCapQty: 0,
    brickChimneyQty: 0,
  })
  const incQty = (key: keyof typeof accessories) => {
    setAccessories(p => ({ ...p, [key]: Math.max(0, (p as any)[key] + 1) }))
  }
  const decQty = (key: keyof typeof accessories) => {
    setAccessories(p => ({ ...p, [key]: Math.max(0, (p as any)[key] - 1) }))
  }
  const setQtySanitized = (key: keyof typeof accessories, value: string) => {
    const digits = value.replace(/\D/g, '')
    const num = digits === '' ? 0 : Math.max(0, parseInt(digits, 10))
    setAccessories(p => ({ ...p, [key]: num }))
  }

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
      
      const response = await fetch(`${apiBase()}/api/estimates/parse-eagleview`, {
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

  const structureToMeasurements = (s: any) => {
    const pitchBreakdown = (s.pitchBreakdown || []).map((p: any) => ({ pitch: String(p.pitch || ''), squares: p.squares || 0 }))
    return {
      roofArea: s.roofArea || 0,
      roofAreaRounded: s.roofAreaRounded || Math.ceil(s.roofArea || 0),
      eavesLength: s.eavesLength || 0,
      rakesLength: s.rakesLength || 0,
      valleysLength: s.valleysLength || 0,
      hipsLength: s.hipsLength || 0,
      ridgesLength: s.ridgesLength || 0,
      pitch: 0,
      stories: s.stories || 1,
      hasTrailerAccess: !options.noTrailerAccess,
      hasSecondLayer: options.secondLayer,
      hasRidgeVent: options.ridgeVent,
      thirdStory: options.thirdStory,
      handLoadMaterials: options.handLoadMaterials,
      lowPitchArea: s.lowPitchArea || 0,
      pitchBreakdown,
    }
  }

  const combineMeasurements = (structures: any[]) => {
    const sum = (arr: number[]) => arr.reduce((a,b)=>a+b,0)
    const pitches: Record<string, number> = {}
    structures.forEach(s => {
      (s.pitchBreakdown || []).forEach((p: any) => {
        const key = String(p.pitch || '')
        pitches[key] = (pitches[key] || 0) + (p.squares || 0)
      })
    })
    const pitchBreakdown = Object.entries(pitches).map(([pitch, squares]) => ({ pitch, squares }))
    const stories = Math.max(...structures.map(s => s.stories || 1), 1)
    const roofArea = sum(structures.map(s => s.roofArea || 0))
    const roofAreaRounded = Math.ceil(sum(structures.map(s => s.roofAreaRounded || Math.ceil((s.roofArea || 0)))))
    const eavesLength = sum(structures.map(s => s.eavesLength || 0))
    const rakesLength = sum(structures.map(s => s.rakesLength || 0))
    const valleysLength = sum(structures.map(s => s.valleysLength || 0))
    const hipsLength = sum(structures.map(s => s.hipsLength || 0))
    const ridgesLength = sum(structures.map(s => s.ridgesLength || 0))
    const lowPitchArea = sum(structures.map(s => s.lowPitchArea || 0))
    return {
      roofArea,
      roofAreaRounded,
      eavesLength,
      rakesLength,
      valleysLength,
      hipsLength,
      ridgesLength,
      pitch: 0,
      stories,
      hasTrailerAccess: !options.noTrailerAccess,
      hasSecondLayer: options.secondLayer,
      hasRidgeVent: options.ridgeVent,
      thirdStory: options.thirdStory,
      handLoadMaterials: options.handLoadMaterials,
      lowPitchArea,
      pitchBreakdown,
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
      const parsedOut = eagleViewData as any
      const hasStructs = Array.isArray(parsedOut?.structures) && parsedOut.structures.length > 0
      const meas = hasStructs
        ? getSelectedMeasurements(parsedOut, includeStructure2, includeStructure3)
        : getStructure1Measurements(parsedOut)
      const totalSq = ((meas?.total_area_sqft || 0) / 100) || 0
      const suggested = Number(meas?.suggested_squares ?? 0)
      const roofMeasurements = {
        roofArea: totalSq,
        roofAreaRounded: Math.ceil(suggested > 0 ? suggested : totalSq),
        eavesLength: meas?.eaves_ft || 0,
        rakesLength: meas?.rakes_ft || 0,
        valleysLength: meas?.valleys_ft || 0,
        hipsLength: meas?.hips_ft || 0,
        ridgesLength: meas?.ridges_ft || 0,
        pitch: 0,
        stories: 1,
        hasTrailerAccess: !options.noTrailerAccess,
        hasSecondLayer: options.secondLayer,
        hasRidgeVent: options.ridgeVent,
        thirdStory: options.thirdStory,
        handLoadMaterials: options.handLoadMaterials,
        lowPitchArea: 0,
        pitchBreakdown: ((meas?.pitch_breakdown || []) as any[]).map(p => ({
          pitch: String(p.pitch || ''),
          squares: ((p.area_sqft || 0) / 100) || 0,
        })),
      }
      const estimateData = {
        customer_name: jobDetails.customerName,
        customer_address: jobDetails.customerAddress,
        project_type: jobDetails.projectType,
        notes: financed ? `${jobDetails.notes || ''} [Financed]`.trim() : jobDetails.notes,
        eagleview_data: eagleViewData,
        roof_measurements: roofMeasurements,
        accessories: [
          ...(accessories.leadBootsQty > 0 ? [{ key: 'leadBoots', quantity: accessories.leadBootsQty }] : []),
          ...(accessories.pvcBootsQty > 0 ? [{ key: 'pvcBoots', quantity: accessories.pvcBootsQty }] : []),
          ...(accessories.turtleVentsQty > 0 ? [{ key: 'turtleVents', quantity: accessories.turtleVentsQty }] : []),
          ...(accessories.rainCapQty > 0 ? [{ key: 'rainCap', quantity: accessories.rainCapQty }] : []),
          ...(accessories.brickChimneyQty > 0 ? [{ key: 'brickChimneyFlashing', quantity: accessories.brickChimneyQty }] : []),
        ],
        status: 'draft'
      }
      
      // Create the estimate
      const response = await fetch(`${apiBase()}/api/estimates`, {
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
                      {Array.isArray((eagleViewData as any)?.structures) && (
                        <p>Structures detected: {(eagleViewData as any).structures.length}</p>
                      )}
                      <p>
                        Roof Area (Structure 1): {(((getStructure1Measurements(eagleViewData)?.total_area_sqft) || 0) / 100).toFixed(1)} squares
                      </p>
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
                  <div className="flex items-center mt-1">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={financed}
                        onChange={(e)=>setFinanced(e.target.checked)}
                        disabled={parsing}
                      />
                      <span>Financed</span>
                    </label>
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
                
                {/* Labor Options */}
                <div className="col-span-1 md:col-span-2">
                  <h3 className="text-md font-semibold text-gray-900 mb-2">Labor Options</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={options.noTrailerAccess} onChange={(e)=>setOptions(p=>({...p,noTrailerAccess:e.target.checked}))} />
                      <span>No Trailer Access (+$/SQ)</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={options.ridgeVent} onChange={(e)=>setOptions(p=>({...p,ridgeVent:e.target.checked}))} />
                      <span>Ridge Vent Install (LF)</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={options.thirdStory} onChange={(e)=>setOptions(p=>({...p,thirdStory:e.target.checked}))} />
                      <span>Third Story (+$/SQ)</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={options.secondLayer} onChange={(e)=>setOptions(p=>({...p,secondLayer:e.target.checked}))} />
                      <span>Second Layer (+$/SQ)</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={options.handLoadMaterials} onChange={(e)=>setOptions(p=>({...p,handLoadMaterials:e.target.checked}))} />
                      <span>Hand Load Materials (+$/SQ)</span>
                    </label>
                  </div>
                </div>
                
                {/* Roofing Accessories */}
                <div className="col-span-1 md:col-span-2">
                  <h3 className="text-md font-semibold text-gray-900 mb-2">Roofing Accessories</h3>
                  {Array.isArray((eagleViewData as any)?.structures) && (eagleViewData as any).structures.length > 1 && (
                    <div className="mb-3 space-y-1">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={includeStructure2}
                          onChange={(e)=>setIncludeStructure2(e.target.checked)}
                        />
                        <span>Include Structure 2</span>
                      </label>
                      {(eagleViewData as any).structures.length > 2 && (
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={includeStructure3}
                            onChange={(e)=>setIncludeStructure3(e.target.checked)}
                          />
                          <span>Include Structure 3</span>
                        </label>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <span>Lead Pipe Boots</span>
                      <div className="flex items-center space-x-2">
                        <button type="button" disabled={parsing} onClick={()=>decQty('leadBootsQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={parsing}
                          value={accessories.leadBootsQty || ''}
                          onChange={(e)=>setQtySanitized('leadBootsQty', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right"
                        />
                        <button type="button" disabled={parsing} onClick={()=>incQty('leadBootsQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <span>PVC Pipe Boots</span>
                      <div className="flex items-center space-x-2">
                        <button type="button" disabled={parsing} onClick={()=>decQty('pvcBootsQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={parsing}
                          value={accessories.pvcBootsQty || ''}
                          onChange={(e)=>setQtySanitized('pvcBootsQty', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right"
                        />
                        <button type="button" disabled={parsing} onClick={()=>incQty('pvcBootsQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <span>Turtle Vents</span>
                      <div className="flex items-center space-x-2">
                        <button type="button" disabled={parsing} onClick={()=>decQty('turtleVentsQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={parsing}
                          value={accessories.turtleVentsQty || ''}
                          onChange={(e)=>setQtySanitized('turtleVentsQty', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right"
                        />
                        <button type="button" disabled={parsing} onClick={()=>incQty('turtleVentsQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <span>Rain Cap</span>
                      <div className="flex items-center space-x-2">
                        <button type="button" disabled={parsing} onClick={()=>decQty('rainCapQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={parsing}
                          value={accessories.rainCapQty || ''}
                          onChange={(e)=>setQtySanitized('rainCapQty', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right"
                        />
                        <button type="button" disabled={parsing} onClick={()=>incQty('rainCapQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <span>Brick Chimney Flashing</span>
                      <div className="flex items-center space-x-2">
                        <button type="button" disabled={parsing} onClick={()=>decQty('brickChimneyQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={parsing}
                          value={accessories.brickChimneyQty || ''}
                          onChange={(e)=>setQtySanitized('brickChimneyQty', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right"
                        />
                        <button type="button" disabled={parsing} onClick={()=>incQty('brickChimneyQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                      </div>
                    </div>
                  </div>
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
