import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-bold text-ink-3">404</p>
      <p className="mt-2 text-ink-2">That page doesn't exist.</p>
      <Link to="/" className="mt-4 inline-block text-over hover:underline">Back to the dashboard</Link>
    </div>
  );
}
