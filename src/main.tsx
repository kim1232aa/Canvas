import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {withCanvasOrigin} from './services/executionTrace';

// Every Canvas-UI call to our own /api carries x-canvas-origin (drivers use plain fetch too); server labels the rest 「本机直调」.
const nativeFetch=window.fetch.bind(window);
window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
  if(typeof input!=='string' && !(input instanceof URL))return nativeFetch(input,init); // Request objects keep their own headers
  const url=typeof input==='string'?input:input.href;
  const path=url.startsWith(window.location.origin)?url.slice(window.location.origin.length):url;
  return nativeFetch(input as any,withCanvasOrigin(path,init));
}) as typeof window.fetch;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
