import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import FormEditor from './pages/FormEditor';
import Share from './pages/Share';
import Submissions from './pages/Submissions';
import Sign from './pages/Sign';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';

// Served at /contracts/ (vite base). /sign is the public page the customer opens; everything
// under Layout needs the site admin sign-in (api/auth/*).
const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/sign" element={<Sign />} />
    <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/editor" element={<FormEditor />} />
        <Route path="/share" element={<Share />} />
        <Route path="/submissions" element={<Submissions />} />
      </Route>
    </Route>
    <Route path="*" element={<PageNotFound />} />
  </Routes>
);

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ScrollToTop />
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
