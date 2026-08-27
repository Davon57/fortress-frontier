import type { Point } from "./types";

const distance = (from: Point, to: Point) => Math.hypot(from.x - to.x, from.y - to.y);

export const createRoute = (start: Point, end: Point, waypoints: readonly Point[]): Point[] => {
  if (!waypoints.length) return [{ ...start }, { ...end }];
  const barrierX = waypoints.reduce((total, point) => total + point.x, 0) / waypoints.length;
  const crossesBarrier = (start.x - barrierX) * (end.x - barrierX) < 0;
  if (!crossesBarrier) return [{ ...start }, { ...end }];

  const node = waypoints.reduce((best, candidate) =>
    distance(start, candidate) + distance(candidate, end) <
    distance(start, best) + distance(best, end)
      ? candidate
      : best,
  );
  return [{ ...start }, { ...node }, { ...end }];
};

export const routeDistance = (route: readonly Point[]) =>
  route.slice(1).reduce((total, point, index) => total + distance(route[index], point), 0);
