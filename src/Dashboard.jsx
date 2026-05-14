import React, { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'
import { LogOut, Download, Users, Activity, Calendar, AlertTriangle, Trash2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [gym, setGym] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newGymName, setNewGymName] = useState('')
  const [creating, setCreating] = useState(false)
  
  const [members, setMembers] = useState([])
  const [attendance, setAttendance] = useState([])
  const [memberships, setMemberships] = useState([])
  
  const [editingMember, setEditingMember] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  const navigate = useNavigate()
  const qrRef = useRef()

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }
      setUser(user)

      const { data: gyms } = await supabase.from('gyms').select('*').eq('owner_id', user.id).limit(1)

      if (gyms && gyms.length > 0) {
        setGym(gyms[0])
        await fetchDashboardStats(gyms[0].id)
      }
      setLoading(false)
    }
    loadData()
  }, [navigate])

  const fetchDashboardStats = async (gymId) => {
    const { data: mData } = await supabase.from('members').select('*').eq('gym_id', gymId).order('created_at', { ascending: false })
    if (mData) setMembers(mData)
    
    const { data: memData } = await supabase.from('memberships').select('*').eq('gym_id', gymId)
    if (memData) setMemberships(memData)
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const { data: aData } = await supabase
      .from('attendance')
      .select('*, members(name)')
      .eq('gym_id', gymId)
      .gte('scanned_at', today.toISOString())
      .order('scanned_at', { ascending: false })
      
    if (aData) setAttendance(aData)
  }

  const handleDeleteCheckin = async (id) => {
    if (!window.confirm("Are you sure you want to delete this check-in?")) return;
    
    setAttendance(prev => prev.filter(a => a.id !== id));
    
    const { error } = await supabase.from('attendance').delete().eq('id', id);
    if (error) {
      alert("Failed to delete: " + error.message);
      await fetchDashboardStats(gym.id);
    }
  }

  const handleDeleteMember = async (id, name) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${name}? This will also delete all of their check-in history.`)) return;

    // Optimistic UI updates
    setMembers(prev => prev.filter(m => m.id !== id));
    setAttendance(prev => prev.filter(a => a.member_id !== id));
    setMemberships(prev => prev.filter(m => m.member_id !== id));

    // Delete from DB (foreign keys ON DELETE CASCADE will handle attendance and memberships in the database automatically)
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) {
      alert("Failed to delete member: " + error.message);
      await fetchDashboardStats(gym.id); // Revert if failed
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleCreateGym = async (e) => {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await supabase.from('gyms').insert([{ name: newGymName, owner_id: user.id }]).select()
    if (data && data.length > 0) {
      setGym(data[0])
      await fetchDashboardStats(data[0].id)
    } else if (error) alert("Error: " + error.message)
    setCreating(false)
  }

  const downloadQR = () => {
    const svg = qrRef.current.querySelector('svg')
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const link = document.createElement("a")
      link.download = "gymtrack-qr.png"
      link.href = canvas.toDataURL("image/png")
      link.click()
    }
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData)
  }

  const saveMembership = async (e) => {
    e.preventDefault()
    const existing = memberships.find(m => m.member_id === editingMember.id)
    if (existing) {
      await supabase.from('memberships').update({ start_date: startDate, end_date: endDate }).eq('id', existing.id)
    } else {
      await supabase.from('memberships').insert([{ member_id: editingMember.id, gym_id: gym.id, start_date: startDate, end_date: endDate }])
    }
    await fetchDashboardStats(gym.id)
    setEditingMember(null)
  }

  const openEditModal = (member) => {
    setEditingMember(member)
    const existing = memberships.find(m => m.member_id === member.id)
    if (existing) {
      setStartDate(existing.start_date)
      setEndDate(existing.end_date)
    } else {
      setStartDate(new Date().toISOString().split('T')[0])
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      setEndDate(nextMonth.toISOString().split('T')[0])
    }
  }

  const getMembershipStatus = (memberId) => {
    const mem = memberships.find(m => m.member_id === memberId)
    if (!mem) return { text: 'No Membership', color: 'var(--text-muted)' }
    const diffDays = Math.ceil((new Date(mem.end_date) - new Date()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { text: 'Expired', color: '#ff5555' }
    if (diffDays <= 7) return { text: `Expiring (${diffDays}d)`, color: '#ffaa00' }
    return { text: 'Active', color: 'var(--accent)' }
  }

  if (loading) return <div style={{ padding: '40px' }}>Loading your dashboard...</div>
  if (!user) return null

  const scanUrl = gym ? `${window.location.origin}/scan?token=${gym.qr_code_token}` : ''
  
  const expiringMembers = memberships.filter(m => {
    const diff = Math.ceil((new Date(m.end_date) - new Date()) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff <= 7
  }).map(m => {
    const member = members.find(user => user.id === m.member_id)
    return member ? member.name : 'Unknown'
  })

  return (
    <div className="app-container">
      <nav className="dashboard-nav">
        <div className="dashboard-nav-logo">Gym<span>Track</span></div>
        <button className="btn" onClick={handleSignOut}>
          <LogOut size={16} /> Sign out
        </button>
      </nav>

      <main className="dashboard-main">
        {!gym ? (
          <div className="card" style={{ maxWidth: '500px', margin: '40px auto' }}>
            <h2 style={{ marginBottom: '8px' }}>Welcome to GymTrack!</h2>
            <form onSubmit={handleCreateGym} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
              <input type="text" placeholder="Enter your Gym's Name" className="input-field" value={newGymName} onChange={(e) => setNewGymName(e.target.value)} required />
              <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create Gym & Generate QR Code'}</button>
            </form>
          </div>
        ) : (
          <div>
            <div className="dashboard-header">
              <h1>{gym.name} Dashboard</h1>
            </div>

            {expiringMembers.length > 0 && (
              <div style={{ background: 'rgba(255, 170, 0, 0.1)', border: '1px solid #ffaa00', borderRadius: '8px', padding: '16px', marginBottom: '32px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <AlertTriangle color="#ffaa00" style={{ flexShrink: 0 }} />
                <div>
                  <h4 style={{ color: '#ffaa00', marginBottom: '4px', fontSize: '16px' }}>Membership Expirations Approaching</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    The following members have subscriptions expiring within the next 7 days: <strong style={{ color: '#fff' }}>{expiringMembers.join(', ')}</strong>
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '8px' }}><Users size={24} color="var(--accent)" /></div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{members.length}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Total Members</div>
                </div>
              </div>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '8px' }}><Activity size={24} color="#00ddff" /></div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{attendance.length}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Check-ins Today</div>
                </div>
              </div>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '8px' }}><Calendar size={24} color="#ffaa00" /></div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{expiringMembers.length}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Expiring This Week</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '18px' }}>Member Database</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: 'var(--surface-hover)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    <tr>
                      <th style={{ padding: '12px 20px' }}>Name</th>
                      <th style={{ padding: '12px 20px' }}>Phone</th>
                      <th style={{ padding: '12px 20px' }}>Status</th>
                      <th style={{ padding: '12px 20px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => {
                      const status = getMembershipStatus(m.id)
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '16px 20px', fontWeight: '500' }}>{m.name}</td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-muted)' }}>{m.phone}</td>
                          <td style={{ padding: '16px 20px' }}>
                            <span style={{ color: status.color, background: `${status.color}22`, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                              {status.text}
                            </span>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => openEditModal(m)}>Edit</button>
                              <button 
                                onClick={() => handleDeleteMember(m.id, m.name)}
                                style={{ background: 'transparent', border: '1px solid rgba(255, 85, 85, 0.3)', color: '#ff5555', cursor: 'pointer', padding: '6px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                title="Delete member completely"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {members.length === 0 && (
                      <tr><td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No members registered yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card">
                  <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Today's Check-ins</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {attendance.map(a => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontWeight: '500' }}>{a.members?.name || 'Unknown'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {new Date(a.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteCheckin(a.id)}
                          style={{ background: 'transparent', border: 'none', color: '#ff5555', cursor: 'pointer', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                          title="Delete check-in"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {attendance.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No check-ins yet today.</p>}
                  </div>
                </div>

                <div className="card" style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Front Desk QR</h3>
                  <div ref={qrRef} style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px' }}>
                    <QRCodeSVG value={scanUrl} size={150} />
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={downloadQR}>
                    <Download size={16} /> Download PNG
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {editingMember && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '16px' }}>Edit Membership</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Update dates for <strong>{editingMember.name}</strong></p>
            
            <form onSubmit={saveMembership} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Start Date</label>
                <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: '14px', color: 'var(--text-muted)' }}>End Date</label>
                <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setEditingMember(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
