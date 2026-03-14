import { useState, useEffect, useRef, useCallback } from 'react'
import { subscribeWsEvent } from '../components/NotificationPoller'
import {
  MessageSquare, Plus, Send, Users, Hash, Trash2, UserPlus,
  ChevronLeft, Search, Paperclip, Image, FileText, X,
  Check, CheckCheck, Upload,
} from 'lucide-react'
import { messengerApi } from '../api/client'
import api from '../api/client'
import { useAuthStore } from '../store/useStore'

interface Room {
  id: number
  name: string
  description: string
  room_type: string
  member_count: number
  members: { user_id: number; username: string; role: string }[]
  last_message: { content: string; user_id: number; created_at: string } | null
  created_at: string
}

interface Message {
  id: number
  room_id: number
  user_id: number
  username: string
  content: string
  message_type: string
  reply_to: number | null
  created_at: string
}

interface ReadStatus {
  user_id: number
  username: string
  last_read_message_id: number | null
}

interface AvailableUser {
  id: number
  username: string
  role: string
}

export default function Messenger() {
  const user = useAuthStore((s) => s.user)
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDesc, setNewRoomDesc] = useState('')
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [selectedMembers, setSelectedMembers] = useState<number[]>([])
  const [searchFilter, setSearchFilter] = useState('')
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [readStatuses, setReadStatuses] = useState<ReadStatus[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const dragCounterRef = useRef(0)

  useEffect(() => {
    loadRooms()
  }, [])

  useEffect(() => {
    if (selectedRoom) {
      loadMessages(selectedRoom.id)
      loadReadStatus(selectedRoom.id)
      // 읽음 처리
      messengerApi.markRead(selectedRoom.id).catch(() => {})

      // WebSocket으로 실시간 메시지 수신
      // subscribeWsEvent imported at top level
      const unsubMsg = subscribeWsEvent('messenger_message', (data: Record<string, unknown>) => {
        if ((data as { room_id?: number }).room_id === selectedRoom.id) {
          setMessages((prev) => [...prev, {
            id: data.message_id as number,
            room_id: data.room_id as number,
            user_id: data.user_id as number,
            username: data.username as string,
            content: data.content as string,
            message_type: (data.message_type as string) || 'text',
            reply_to: (data.reply_to as number) || null,
            created_at: data.created_at as string,
          }])
          // 새 메시지 수신 시 자동 읽음 처리
          messengerApi.markRead(selectedRoom.id).catch(() => {})
        }
      })
      // 읽음 상태 수신
      const unsubRead = subscribeWsEvent('messenger_read', (data: Record<string, unknown>) => {
        if ((data as { room_id?: number }).room_id === selectedRoom.id) {
          setReadStatuses((prev) => {
            const filtered = prev.filter((s) => s.user_id !== (data.user_id as number))
            return [...filtered, {
              user_id: data.user_id as number,
              username: '',
              last_read_message_id: data.last_read_message_id as number,
            }]
          })
        }
      })
      // 30초 폴백 폴링
      pollRef.current = setInterval(() => loadMessages(selectedRoom.id), 30000)
      return () => { unsubMsg(); unsubRead(); clearInterval(pollRef.current) }
    }
  }, [selectedRoom?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadRooms = async () => {
    try {
      const r = await messengerApi.listRooms()
      setRooms(r.data)
    } catch { /* silent */ }
  }

  const loadMessages = async (roomId: number) => {
    try {
      const r = await messengerApi.listMessages(roomId, 100)
      setMessages(r.data.messages)
    } catch { /* silent */ }
  }

  const loadReadStatus = async (roomId: number) => {
    try {
      const r = await messengerApi.readStatus(roomId)
      setReadStatuses(r.data)
    } catch { /* silent */ }
  }

  const handleSend = async () => {
    if (!input.trim() || !selectedRoom) return
    setLoading(true)
    try {
      await messengerApi.sendMessage(selectedRoom.id, { content: input.trim() })
      setInput('')
      loadMessages(selectedRoom.id)
    } catch { /* silent */ }
    setLoading(false)
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return
    try {
      const r = await messengerApi.createRoom({
        name: newRoomName.trim(),
        description: newRoomDesc,
        member_ids: selectedMembers,
      })
      setRooms((prev) => [r.data, ...prev])
      setSelectedRoom(r.data)
      setShowCreate(false)
      setNewRoomName('')
      setNewRoomDesc('')
      setSelectedMembers([])
      setMobileShowChat(true)
    } catch { /* silent */ }
  }

  const uploadFile = async (file: File) => {
    if (!selectedRoom) return
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기가 10MB를 초과합니다.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/messenger/rooms/${selectedRoom.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      loadMessages(selectedRoom.id)
    } catch { /* silent */ }
    setUploading(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── 드래그 & 드롭 핸들러 ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    for (const file of files) {
      await uploadFile(file)
    }
  }, [selectedRoom])

  const isImageFile = (content: string) => {
    return /\.(jpg|jpeg|png|gif|webp|svg)/i.test(content)
  }

  const parseFileMessage = (content: string) => {
    const match = content.match(/^\[file:(.*?)\]\((.*?)\)$/)
    if (match) return { name: match[1], url: match[2] }
    return null
  }

  const handleDeleteRoom = async (roomId: number) => {
    if (!confirm('채팅방을 삭제하시겠습니까?')) return
    try {
      await messengerApi.deleteRoom(roomId)
      setRooms((prev) => prev.filter((r) => r.id !== roomId))
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null)
        setMessages([])
      }
    } catch { /* silent */ }
  }

  const handleInvite = async (userId: number) => {
    if (!selectedRoom) return
    try {
      await messengerApi.addMember(selectedRoom.id, { user_id: userId })
      loadRooms()
      setShowInvite(false)
    } catch { /* silent */ }
  }

  const loadUsers = async () => {
    try {
      const r = await messengerApi.listUsers()
      setAvailableUsers(r.data)
    } catch { /* silent */ }
  }

  const openCreate = () => {
    loadUsers()
    setShowCreate(true)
  }

  const openInvite = () => {
    loadUsers()
    setShowInvite(true)
  }

  const selectRoom = (room: Room) => {
    setSelectedRoom(room)
    setMobileShowChat(true)
  }

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      const now = new Date()
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      }
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  // 메시지가 다른 멤버에 의해 읽혔는지 확인
  const getReadCount = (messageId: number) => {
    if (!user) return 0
    return readStatuses.filter(
      (s) => s.user_id !== user.id && s.last_read_message_id !== null && s.last_read_message_id >= messageId
    ).length
  }

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchFilter.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-7rem)] flex rounded-xl overflow-hidden border border-bg-border">
      {/* Room List — hidden on mobile when chat is shown */}
      <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-bg-card border-r border-bg-border flex-shrink-0`}>
        {/* Header */}
        <div className="p-4 border-b border-bg-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <MessageSquare size={18} className="text-brand-light" />
              메신저
            </h2>
            <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
              <Plus size={14} /> 새 채팅
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-sm"
              placeholder="채팅방 검색..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto">
          {filteredRooms.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              채팅방이 없습니다.<br />새 채팅을 시작하세요.
            </div>
          ) : (
            filteredRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => selectRoom(room)}
                className={`w-full text-left px-4 py-3 border-b border-bg-border/50 hover:bg-bg-elevated transition-colors ${
                  selectedRoom?.id === room.id ? 'bg-brand/10 border-l-2 border-l-brand' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center flex-shrink-0">
                    <Hash size={16} className="text-brand-light" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200 truncate">{room.name}</span>
                      {room.last_message && (
                        <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">
                          {formatTime(room.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {room.last_message?.content || room.description || `${room.member_count}명`}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${!mobileShowChat ? 'hidden md:flex' : 'flex'} flex-col flex-1 bg-bg-base`}>
        {selectedRoom ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-bg-border bg-bg-card flex items-center gap-3">
              <button
                onClick={() => setMobileShowChat(false)}
                className="md:hidden p-1 text-slate-400 hover:text-slate-200"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="w-9 h-9 rounded-lg bg-brand/15 flex items-center justify-center">
                <Hash size={16} className="text-brand-light" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{selectedRoom.name}</div>
                <div className="text-[11px] text-slate-500">{selectedRoom.member_count}명</div>
              </div>
              <button onClick={openInvite} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated" title="멤버 초대">
                <UserPlus size={16} />
              </button>
              <button onClick={() => handleDeleteRoom(selectedRoom.id)} className="p-2 rounded-lg text-slate-400 hover:text-danger hover:bg-danger/10" title="채팅방 삭제">
                <Trash2 size={16} />
              </button>
            </div>

            {/* Messages — 드래그 & 드롭 영역 */}
            <div
              className={`flex-1 overflow-y-auto p-4 space-y-3 relative transition-colors ${
                isDragOver ? 'bg-brand/5' : ''
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* 드래그 오버레이 */}
              {isDragOver && (
                <div className="absolute inset-0 bg-brand/10 border-2 border-dashed border-brand rounded-lg z-10 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-brand-light">
                    <Upload size={32} />
                    <span className="text-sm font-medium">파일을 여기에 놓으세요</span>
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isMe = msg.user_id === user?.id
                const isSystem = msg.message_type === 'system'

                if (isSystem) {
                  return (
                    <div key={msg.id} className="text-center">
                      <span className="text-[11px] text-slate-500 bg-bg-card px-3 py-1 rounded-full">
                        {msg.content}
                      </span>
                    </div>
                  )
                }

                const fileInfo = msg.message_type === 'file' ? parseFileMessage(msg.content) : null
                const isImg = fileInfo && isImageFile(fileInfo.url)
                const readCount = isMe ? getReadCount(msg.id) : 0

                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] sm:max-w-[65%] ${isMe ? 'order-2' : ''}`}>
                      {!isMe && (
                        <span className="text-[11px] text-slate-500 ml-1 mb-0.5 block">{msg.username}</span>
                      )}
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                        isMe
                          ? 'bg-brand text-white rounded-br-md'
                          : 'bg-bg-card text-slate-200 rounded-bl-md border border-bg-border'
                      }`}>
                        {fileInfo ? (
                          isImg ? (
                            <div>
                              <img
                                src={fileInfo.url}
                                alt={fileInfo.name}
                                className="max-w-full max-h-60 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setPreviewImage(fileInfo.url)}
                              />
                              <span className="text-[10px] opacity-70 mt-1 block">{fileInfo.name}</span>
                            </div>
                          ) : (
                            <a href={fileInfo.url} target="_blank" rel="noopener noreferrer"
                              className={`flex items-center gap-2 ${isMe ? 'text-white/90 hover:text-white' : 'text-brand-light hover:text-brand'}`}>
                              <FileText size={16} className="flex-shrink-0" />
                              <span className="truncate underline">{fileInfo.name}</span>
                            </a>
                          )
                        ) : (
                          msg.content
                        )}
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`}>
                        <span className="text-[10px] text-slate-600">
                          {formatTime(msg.created_at)}
                        </span>
                        {/* 읽음 확인 체크 아이콘 (내 메시지만) */}
                        {isMe && (
                          readCount > 0 ? (
                            <CheckCheck size={12} className="text-blue-400" title={`${readCount}명 읽음`} />
                          ) : (
                            <Check size={12} className="text-slate-600" title="전송됨" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-bg-border bg-bg-card">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv,.zip"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-2.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors flex-shrink-0"
                  title="파일 첨부"
                >
                  {uploading ? (
                    <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Paperclip size={16} />
                  )}
                </button>
                <input
                  className="input flex-1 text-sm"
                  placeholder="메시지를 입력하세요..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  disabled={loading}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="btn-primary p-2.5 rounded-lg disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">채팅방을 선택하세요</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-bg-card border border-bg-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-100 mb-4">새 채팅방</h3>
            <input
              className="input w-full mb-3 text-sm"
              placeholder="채팅방 이름"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
            />
            <input
              className="input w-full mb-3 text-sm"
              placeholder="설명 (선택)"
              value={newRoomDesc}
              onChange={(e) => setNewRoomDesc(e.target.value)}
            />
            <div className="mb-3">
              <p className="text-xs text-slate-400 mb-2">멤버 초대 (선택)</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {availableUsers.filter((u) => u.id !== user?.id).map((u) => (
                  <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-elevated cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(u.id)}
                      onChange={(e) => {
                        setSelectedMembers((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                        )
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-300">{u.username}</span>
                    <span className="text-[10px] text-slate-500">{u.role}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm px-4 py-2">취소</button>
              <button onClick={handleCreateRoom} disabled={!newRoomName.trim()} className="btn-primary text-sm px-4 py-2 disabled:opacity-40">생성</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70">
            <X size={20} />
          </button>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && selectedRoom && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-bg-card border border-bg-border rounded-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Users size={16} /> 멤버 초대
            </h3>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {availableUsers
                .filter((u) => !selectedRoom.members.some((m) => m.user_id === u.id))
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleInvite(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-elevated text-left transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-brand-light">{u.username[0]}</span>
                    </div>
                    <div>
                      <div className="text-sm text-slate-200">{u.username}</div>
                      <div className="text-[10px] text-slate-500">{u.role}</div>
                    </div>
                  </button>
                ))}
            </div>
            <button onClick={() => setShowInvite(false)} className="btn-ghost text-sm w-full mt-3 py-2">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
