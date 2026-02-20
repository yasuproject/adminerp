/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, Lock, ArrowRight, Menu, X, Home, 
  BarChart2, Settings, Users, Package, 
  LogOut, Bell, Search, ChevronRight
} from 'lucide-react';

// --- Types ---
type View = 'login' | 'dashboard' | 'users';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface UserData {
  id?: number;
  username: string;
  email: string;
  password?: string;
  confirmPassword?: string;
  full_name: string;
  role: 'admin' | 'manager' | 'cashier' | 'sales' | 'inventory';
  phone_number?: string;
  is_active?: number;
  created_at?: string;
  last_login?: string;
}

// --- Animation Variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

const drawerVariants = {
  closed: { x: '-100%', transition: { type: 'spring', damping: 25, stiffness: 200 } },
  open: { x: 0, transition: { type: 'spring', damping: 25, stiffness: 200 } },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
};

// --- Components ---

const NavItem = ({ icon: Icon, label, active, onClick }: any) => (
  <motion.button
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
        : 'text-zinc-400 hover:bg-white/5 hover:text-white'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </motion.button>
);

const StatCard = ({ title, value, trend, icon: Icon, color }: any) => (
  <motion.div 
    variants={itemVariants}
    className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-6 backdrop-blur-xl"
  >
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-500`}>
        <Icon size={24} />
      </div>
      <span className={`text-xs font-bold ${trend.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
        {trend}
      </span>
    </div>
    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">{title}</h3>
    <p className="text-2xl font-bold text-white">{value}</p>
  </motion.div>
);

const ToastContainer = ({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: number) => void }) => (
  <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3">
    <AnimatePresence>
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, x: 100, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.8 }}
          className={`px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[280px] backdrop-blur-xl border ${
            toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' :
            toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
            'bg-blue-500/20 border-blue-500/30 text-blue-400'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${
            toast.type === 'success' ? 'bg-emerald-400' :
            toast.type === 'error' ? 'bg-red-400' : 'bg-blue-400'
          }`} />
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X size={16} />
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

export default function App() {
  const [view, setView] = useState<View>('login');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [activeTab, setActiveTab] = useState('Home');
  
  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (type: Toast['type'], message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 4000);
  };
  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  
  // Users State
  const [users, setUsers] = useState<UserData[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [userForm, setUserForm] = useState<UserData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'cashier',
    phone_number: '',
    is_active: 1
  });

  useEffect(() => {
    fetch('/api/db-status')
      .then(res => res.ok ? setDbStatus('connected') : setDbStatus('error'))
      .catch(() => setDbStatus('error'));
    
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      
      if (res.ok) {
        addToast('success', `Welcome back, ${data.user.username}!`);
        setView('dashboard');
      } else {
        addToast('error', data.error || 'Login failed');
      }
    } catch (err) {
      addToast('error', 'Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setView('login');
    setIsDrawerOpen(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      
      const payload = {
        username: userForm.username,
        email: userForm.email,
        full_name: userForm.full_name,
        role: userForm.role,
        phone_number: userForm.phone_number || null,
        is_active: userForm.is_active,
        ...(userForm.password ? { password: userForm.password } : {})
      };
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        fetchUsers();
        setIsUserModalOpen(false);
        setEditingUser(null);
        setUserForm({
          username: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
        addToast('success', editingUser ? 'User updated successfully' : 'User created successfully');
      } else {
        const data = await res.json();
        addToast('error', data.error || "Failed to save user");
      }
    } catch (err) {
      console.error("Error saving user:", err);
      addToast('error', 'Failed to save user');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error("Error deleting user:", err);
    }
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setUserForm({ 
      username: user.username, 
      email: user.email || '', 
      password: '', 
      confirmPassword: '',
      full_name: user.full_name,
      role: user.role,
      phone_number: user.phone_number || '',
      is_active: user.is_active || 1
    });
    setIsUserModalOpen(true);
  };

  if (view === 'login') {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#050505] fixed inset-0">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.15, 0.1], x: [0, 20, 0], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" 
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.12, 0.1], x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" 
        />

        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-[400px] z-10 flex flex-col">
          <motion.div variants={itemVariants} className="text-center mb-8">
            <motion.div whileHover={{ scale: 1.05, rotate: 5 }} className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-6 backdrop-blur-sm">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-500 rounded-lg shadow-lg shadow-blue-500/30" />
            </motion.div>
            <h1 className="text-4xl font-bold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">Admin Login</h1>
            <p className="text-zinc-500 text-sm font-medium tracking-wide">Sebri Business Solution</p>
            <div className="mt-4 flex justify-center items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : dbStatus === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-zinc-600 animate-pulse'}`} />
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">{dbStatus === 'connected' ? 'Database Online' : dbStatus === 'error' ? 'Database Offline' : 'Connecting...'}</span>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <form onSubmit={handleLogin} className="space-y-6 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] ml-1">Username or Email</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-blue-400 transition-colors"><User size={18} /></div>
                  <input type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Enter your username" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all placeholder:text-zinc-700 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] ml-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-blue-400 transition-colors"><Lock size={18} /></div>
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all placeholder:text-zinc-700 text-white" />
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed shadow-xl shadow-blue-600/20">
                {isLoading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <>Login<ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-white flex flex-col overflow-hidden">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-4 border-b border-white/5 z-20 bg-[#050505]/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsDrawerOpen(true)}
            className="p-2 hover:bg-white/5 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </motion.button>
          <h1 className="font-bold text-lg tracking-tight">
            {view === 'dashboard' ? 'Dashboard' : 'User Management'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-white/5 rounded-xl text-zinc-400 transition-colors"><Search size={20} /></button>
          <button className="p-2 hover:bg-white/5 rounded-xl text-zinc-400 transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#050505]" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-500 ml-2" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -20 }}
              className="max-w-7xl mx-auto space-y-8"
            >
              {/* Welcome Section */}
              <motion.div variants={itemVariants}>
                <h2 className="text-3xl font-bold mb-1">Hello, Admin</h2>
                <p className="text-zinc-500 text-sm">Here's what's happening with Sebri Business today.</p>
              </motion.div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Revenue" value="$45,231.89" trend="+12.5%" icon={BarChart2} color="blue" />
                <StatCard title="Active Users" value="2,345" trend="+3.2%" icon={Users} color="indigo" />
                <StatCard title="Total Orders" value="1,203" trend="-1.5%" icon={Package} color="emerald" />
                <StatCard title="Conversion" value="3.45%" trend="+0.8%" icon={ArrowRight} color="blue" />
              </div>

              {/* Recent Activity / Charts Placeholder */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <motion.div 
                  variants={itemVariants}
                  className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl"
                >
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold text-xl">Revenue Overview</h3>
                    <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none">
                      <option>Last 7 Days</option>
                      <option>Last 30 Days</option>
                    </select>
                  </div>
                  <div className="h-64 flex items-end justify-between gap-2 px-2">
                    {[40, 70, 45, 90, 65, 80, 55].map((h, i) => (
                      <motion.div 
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: 0.5 + i * 0.1, duration: 1 }}
                        className="flex-1 bg-gradient-to-t from-blue-600/20 to-blue-500 rounded-t-xl relative group"
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          ${h}k
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-4 px-2 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                  </div>
                </motion.div>

                <motion.div 
                  variants={itemVariants}
                  className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl"
                >
                  <h3 className="font-bold text-xl mb-6">Recent Users</h3>
                  <div className="space-y-6">
                    {[
                      { name: 'Alex Johnson', email: 'alex@example.com', img: 'AJ' },
                      { name: 'Sarah Smith', email: 'sarah@example.com', img: 'SS' },
                      { name: 'Michael Chen', email: 'michael@example.com', img: 'MC' },
                      { name: 'Emma Wilson', email: 'emma@example.com', img: 'EW' },
                    ].map((user, i) => (
                      <div key={i} className="flex items-center justify-between group cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10 group-hover:border-blue-500/50 transition-colors">
                            {user.img}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{user.name}</p>
                            <p className="text-xs text-zinc-500">{user.email}</p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-zinc-600 group-hover:text-white transition-colors" />
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors">
                    View All Users
                  </button>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="users"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -20 }}
              className="max-w-7xl mx-auto space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold mb-1">Users</h2>
                  <p className="text-zinc-500 text-sm">Manage your team and their access levels.</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({
                      username: '',
                      email: '',
                      password: '',
                      confirmPassword: '',
                      full_name: '',
                      role: 'cashier',
                      phone_number: '',
                      is_active: 1
                    });
                    setIsUserModalOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-blue-600/20 flex items-center gap-2"
                >
                  <Users size={20} />
                  Add New User
                </motion.button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((user) => (
                  <motion.div 
                    key={user.id}
                    variants={itemVariants}
                    className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-6 backdrop-blur-xl group hover:bg-white/[0.05] transition-all relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                    
                    <div className="flex items-start justify-between mb-6 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-lg border border-blue-500/20">
                          {user.full_name ? user.full_name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <p className="font-bold text-lg tracking-tight">{user.full_name}</p>
                          <p className="text-xs text-zinc-500 font-medium">@{user.username}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        user.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400' :
                        user.role === 'manager' ? 'bg-blue-500/10 text-blue-400' :
                        user.role === 'sales' ? 'bg-emerald-500/10 text-emerald-400' :
                        user.role === 'inventory' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-zinc-500/10 text-zinc-400'
                      }`}>
                        {user.role}
                      </span>
                    </div>

                    <div className="space-y-3 mb-8 relative z-10">
                      <div className="flex items-center gap-3 text-zinc-400">
                        <div className="p-1.5 rounded-lg bg-white/5">
                          <User size={14} className="opacity-70" />
                        </div>
                        <span className="text-xs font-medium truncate">{user.email}</span>
                      </div>
                      {user.phone_number && (
                        <div className="flex items-center gap-3 text-zinc-400">
                          <div className="p-1.5 rounded-lg bg-white/5">
                            <Lock size={14} className="opacity-70" />
                          </div>
                          <span className="text-xs font-medium">{user.phone_number}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-6 border-t border-white/5 relative z-10">
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => openEditModal(user)}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/5 hover:bg-blue-500/10 hover:text-blue-400 transition-all text-[10px] font-bold uppercase tracking-widest"
                      >
                        <Settings size={16} />
                        Edit
                      </motion.button>
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDeleteUser(user.id!)}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/5 hover:bg-red-500/10 hover:text-red-400 transition-all text-[10px] font-bold uppercase tracking-widest"
                      >
                        <LogOut size={16} className="rotate-180" />
                        Delete
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            />
            <motion.div 
              variants={drawerVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-[#0a0a0a] border-r border-white/10 z-40 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-500 rounded-xl" />
                  <span className="font-bold text-lg tracking-tight">Sebri Admin</span>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-white/5 rounded-xl text-zinc-500"><X size={20} /></button>
              </div>

              <nav className="flex-1 space-y-2">
                <NavItem icon={Home} label="Home" active={view === 'dashboard'} onClick={() => { setView('dashboard'); setIsDrawerOpen(false); }} />
                <NavItem icon={Users} label="Users" active={view === 'users'} onClick={() => { setView('users'); setIsDrawerOpen(false); }} />
                <NavItem icon={BarChart2} label="Analytics" active={false} onClick={() => {}} />
                <NavItem icon={Package} label="Inventory" active={false} onClick={() => {}} />
                <NavItem icon={Settings} label="Settings" active={false} onClick={() => {}} />
              </nav>

              <div className="pt-6 border-t border-white/5">
                <NavItem icon={LogOut} label="Logout" onClick={handleLogout} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* User Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUserModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold">{editingUser ? 'Edit User' : 'Add New User'}</h3>
                <button onClick={() => setIsUserModalOpen(false)} className="p-2 hover:bg-white/5 rounded-xl text-zinc-500"><X size={24} /></button>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      type="text"
                      required
                      value={userForm.full_name}
                      onChange={e => setUserForm({...userForm, full_name: e.target.value})}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Username</label>
                    <input 
                      type="text"
                      required
                      value={userForm.username}
                      onChange={e => setUserForm({...userForm, username: e.target.value})}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Email</label>
                    <input 
                      type="email"
                      required
                      value={userForm.email}
                      onChange={e => setUserForm({...userForm, email: e.target.value})}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Phone Number</label>
                    <input 
                      type="text"
                      value={userForm.phone_number || ''}
                      onChange={e => setUserForm({...userForm, phone_number: e.target.value})}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Role</label>
                    <select 
                      value={userForm.role}
                      onChange={e => setUserForm({...userForm, role: e.target.value as any})}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 appearance-none"
                    >
                      <option value="admin" className="bg-[#0a0a0a]">Admin</option>
                      <option value="manager" className="bg-[#0a0a0a]">Manager</option>
                      <option value="cashier" className="bg-[#0a0a0a]">Cashier</option>
                      <option value="sales" className="bg-[#0a0a0a]">Sales</option>
                      <option value="inventory" className="bg-[#0a0a0a]">Inventory</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Status</label>
                    <select 
                      value={userForm.is_active}
                      onChange={e => setUserForm({...userForm, is_active: parseInt(e.target.value)})}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 appearance-none"
                    >
                      <option value={1} className="bg-[#0a0a0a]">Active</option>
                      <option value={0} className="bg-[#0a0a0a]">Inactive</option>
                    </select>
                  </div>
                  
                  {!editingUser && (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                      <input 
                        type="password" required
                        value={userForm.password}
                        onChange={e => setUserForm({...userForm, password: e.target.value})}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                      />
                    </div>
                  )}
                  
                  {editingUser && (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">New Password (leave blank to keep current)</label>
                      <input 
                        type="password"
                        value={userForm.password}
                        onChange={e => setUserForm({...userForm, password: e.target.value})}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsUserModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 font-bold hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
                  >
                    {editingUser ? 'Update User' : 'Create User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
