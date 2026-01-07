'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Plus, Trash2, Edit2, Shield, User, Search, RefreshCw, Mail, Lock } from 'lucide-react';

interface AdminUser {
    id: string; // Email is ID
    name: string;
    email: string;
    role: 'superadmin' | 'admin' | 'vendedor';
    active: boolean;
    createdAt: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [formData, setFormData] = useState({ name: '', email: '', role: 'admin', active: true });
    const [saving, setSaving] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'sys_admin_users'));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminUser));
            setUsers(list);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const emailKey = formData.email.toLowerCase().trim();
            const docRef = doc(db, 'sys_admin_users', emailKey);

            await setDoc(docRef, {
                name: formData.name,
                email: emailKey,
                role: formData.role,
                active: formData.active,
                createdAt: editingUser?.createdAt || new Date().toISOString()
            }, { merge: true });

            setIsModalOpen(false);
            fetchUsers();
            resetForm();
        } catch (error) {
            alert("Error guardando usuario");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(`¿Eliminar acceso a ${id}? Esto no borra la cuenta de Auth, solo revoca acceso al panel.`)) return;
        try {
            await deleteDoc(doc(db, 'sys_admin_users', id));
            fetchUsers();
        } catch (error) {
            alert("Error eliminando");
        }
    };

    const openModal = (user?: AdminUser) => {
        if (user) {
            setEditingUser(user);
            setFormData({ name: user.name, email: user.email, role: user.role as string, active: user.active });
        } else {
            setEditingUser(null);
            resetForm();
        }
        setIsModalOpen(true);
    };

    const resetForm = () => setFormData({ name: '', email: '', role: 'admin', active: true });

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
                    <p className="text-gray-500">Administra el acceso al panel (Lista Blanca).</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="bg-brand-blue text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-blue-800 transition shadow-lg"
                >
                    <Plus size={20} /> Nuevo Usuario
                </button>
            </header>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o correo..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                        <tr>
                            <th className="p-4">Usuario</th>
                            <th className="p-4">Rol</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-400">Cargando...</td></tr>
                        ) : filteredUsers.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50 transition">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-brand-blue font-bold">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{user.name}</p>
                                            <p className="text-sm text-gray-500">{user.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                                            user.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                        }`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {user.active ? (
                                        <span className="flex items-center gap-1 text-green-600 text-sm font-medium"><Shield size={14} /> Activo</span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-red-500 text-sm font-medium"><Lock size={14} /> Inactivo</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-2">
                                        <button onClick={() => openModal(user)} className="p-2 text-gray-400 hover:text-brand-blue hover:bg-blue-50 rounded-lg transition">
                                            <Edit2 size={18} />
                                        </button>
                                        <button onClick={() => handleDelete(user.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900">
                                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                <input
                                    required
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico (ID)</label>
                                <input
                                    type="email"
                                    required
                                    disabled={!!editingUser} // ID cannot change
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                                {!editingUser && <p className="text-xs text-brand-blue mt-1">Este correo se agregará a la Lista Blanca. El usuario deberá registrarse usando este mismo email.</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                    <select
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="vendedor">Vendedor</option>
                                        <option value="admin">Administrador</option>
                                        <option value="superadmin">Super Admin</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                    <input
                                        type="checkbox"
                                        id="active"
                                        checked={formData.active}
                                        onChange={e => setFormData({ ...formData, active: e.target.checked })}
                                        className="w-5 h-5 text-brand-blue rounded focus:ring-brand-blue"
                                    />
                                    <label htmlFor="active" className="text-sm font-medium text-gray-700 cursor-pointer">Usuario Activo</label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={saving} className="px-6 py-2 bg-brand-blue text-white rounded-lg hover:bg-blue-800 font-bold shadow-lg">
                                    {saving ? 'Guardando...' : 'Guardar Usuario'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
