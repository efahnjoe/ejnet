import type e from 'express';

export type IHandler = e.Handler;
export type IRouterHandler<T, Route extends string = string> = e.IRouterHandler<T>

export interface Handler extends e.Handler { }

export type IErrorRequestHandler = e.ErrorRequestHandler;
export interface ErrorRequestHandler extends IErrorRequestHandler { }

export interface RouterHandler<T, Route extends string = string> extends e.IRouterHandler<T> { }
