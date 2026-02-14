import { NavLink, Outlet } from 'react-router-dom';
import { disconnect } from '../libs/request';
import { markLoggedOut } from '../store/slices/authSlice';
import { useAppDispatch } from '../store/hooks';

const getSidebarItemClassName = ({ isActive }: { isActive: boolean }) =>
  `sidebar-item${isActive ? ' active' : ''}`;

export default function AdminLayout() {
  const dispatch = useAppDispatch();

  const handleLogout = async () => {
    dispatch(markLoggedOut());
    await disconnect();
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-badge">RM</div>
          <span>ScopeManager</span>
        </div>

        <nav className="sidebar-menu">
          <NavLink to="/dashboard" className={getSidebarItemClassName}>
            Dashboard
          </NavLink>
          <span className="sidebar-item sidebar-item-static">Users</span>
          <span className="sidebar-item sidebar-item-static">Routes</span>
          <span className="sidebar-item sidebar-item-static">Permissions</span>
          <span className="sidebar-item sidebar-item-static">Activity Logs</span>
        </nav>

        <div className="sidebar-footer">
          <p>Route Admin</p>
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
