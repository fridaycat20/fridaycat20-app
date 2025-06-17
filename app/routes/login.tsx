import { Navigate } from 'react-router';
import { useAuth } from '~/context/AuthContext';
import { LoginForm } from '~/components/Auth/LoginForm';

export default function Login() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <LoginForm />;
}