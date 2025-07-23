import type e from 'express';

export type IRequest = e.Request;

export interface Request extends IRequest {
  // route: Route;
}
