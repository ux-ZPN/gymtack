import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function Scan() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  
  const [loading, setLoading] = useState(true)
  const [gym, setGym] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('verifying') 
  
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  
  // Use a ref to prevent strict-mode double firing or dependency loops
  const hasLogged = useRef(false)

  useEffect(() => {
    if (!token) {
      setError("No QR token found in URL.")
      setLoading(false)
      return
    }

    const verifyToken = async () => {
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .eq('qr_code_token', token)
        .single()
      
      if (error || !data) {
        setError("Invalid QR Code. This gym does not exist.")
        setLoading(false)
        return
      }
      
      setGym(data)
      
      const savedMemberId = localStorage.getItem('gymtrack_member_id')
      if (savedMemberId) {
        if (!hasLogged.current) {
          hasLogged.current = true
          await logAttendance(savedMemberId, data.id)
        }
      } else {
        setStatus('registering')
        setLoading(false)
      }
    }
    
    verifyToken()
  }, [token]) // Removed memberId from dependencies

  const logAttendance = async (mId, gId) => {
    setLoading(true)
    const { error } = await supabase
      .from('attendance')
      .insert([{ member_id: mId, gym_id: gId }])
      
    if (error) {
      setError("Failed to check in: " + error.message)
    } else {
      setStatus('checked_in')
    }
    setLoading(false)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    const { data, error } = await supabase
      .from('members')
      .insert([{ gym_id: gym.id, name, phone }])
      .select()
      .single()
      
    if (error) {
      setError("Registration failed: " + error.message)
      setLoading(false)
      return
    }
    
    const newMemberId = data.id
    localStorage.setItem('gymtrack_member_id', newMemberId)
    localStorage.setItem('gymtrack_member_name', name)
    
    // Log attendance exactly once
    if (!hasLogged.current) {
      hasLogged.current = true
      await logAttendance(newMemberId, gym.id)
    }
  }

  if (loading && status === 'verifying') {
    return <div className="app-container" style={{ padding: '40px', textAlign: 'center' }}>Validating Gym QR Code...</div>
  }

  if (error) {
    return (
      <div className="app-container" style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--error)' }}>Error</h2>
        <p>{error}</p>
      </div>
    )
  }

  const memberName = localStorage.getItem('gymtrack_member_name') || name

  return (
    <div className="app-container" style={{ justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>{gym.name}</h1>
        
        {status === 'registering' && (
          <>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Welcome! Please register to check in.
            </p>
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-muted)' }}>Full Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-muted)' }}>Phone Number</label>
                <input 
                  type="tel" 
                  className="input-field" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required 
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
                {loading ? 'Registering...' : 'Complete Registration & Check In'}
              </button>
            </form>
          </>
        )}
        
        {status === 'checked_in' && (
          <div style={{ padding: '24px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: 'var(--accent)', marginBottom: '8px' }}>Checked In Successfully!</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Welcome back, <strong>{memberName}</strong>.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
              {new Date().toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
