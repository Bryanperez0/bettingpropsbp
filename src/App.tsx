import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import Dashboard from "./pages/Dashboard";

const TopProps = lazy(() => import("./pages/TopProps"));
const PropDetail = lazy(() => import("./pages/PropDetail"));
const Games = lazy(() => import("./pages/Games"));
const GameDetail = lazy(() => import("./pages/GameDetail"));
const Players = lazy(() => import("./pages/Players"));
const PlayerDetail = lazy(() => import("./pages/PlayerDetail"));
const PropFinder = lazy(() => import("./pages/PropFinder"));
const Injuries = lazy(() => import("./pages/Injuries"));
const Performance = lazy(() => import("./pages/Performance"));
const Methodology = lazy(() => import("./pages/Methodology"));
const NotFound = lazy(() => import("./pages/NotFound"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="top" element={<TopProps />} />
            <Route path="props/:id" element={<PropDetail />} />
            <Route path="games" element={<Games />} />
            <Route path="games/:id" element={<GameDetail />} />
            <Route path="players" element={<Players />} />
            <Route path="players/:id" element={<PlayerDetail />} />
            <Route path="finder" element={<PropFinder />} />
            <Route path="injuries" element={<Injuries />} />
            <Route path="performance" element={<Performance />} />
            <Route path="methodology" element={<Methodology />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
