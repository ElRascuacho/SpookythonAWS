import {useEffect,useRef} from 'react';
import {driver,type Driver} from 'driver.js';
import 'driver.js/dist/driver.css';
import './GameGuidedTour.css';
export type GameTourStep=0|1|2|3|4;
/** Progress is controlled exclusively by successful game actions in App, not popover navigation. */
export function GameGuidedTour({active,step,onCancel}:{active:boolean;step:GameTourStep;onCancel:()=>void}){
 const instance=useRef<Driver|null>(null),cancel=useRef(onCancel);cancel.current=onCancel;
 useEffect(()=>{
  if(!active)return;
  let cleaning=false;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tour=driver({animate:!reduced,smoothScroll:!reduced,overlayColor:'#061017',overlayOpacity:.72,stagePadding:8,stageRadius:8,disableActiveInteraction:false,advanceOnClick:false,allowKeyboardControl:false,overlayClickBehavior:()=>{},showButtons:['close'],allowClose:true,closeBtnLabel:'Salir de la práctica guiada',showProgress:true,progressText:'{{current}} de {{total}}',popoverClass:'game-guided-popover',onNextClick:()=>{},onPrevClick:()=>{},onHighlighted:element=>{if(element instanceof HTMLElement)element.focus({preventScroll:true});},onDestroyed:()=>{instance.current=null;if(!cleaning)cancel.current();},steps:[
   {element:'[data-game-tour="zone"]',popover:{title:'1. Elige una zona',description:'Selecciona otra zona en este control real. El recorrido solo avanza cuando cambias la selección. Estás en una práctica: al salir se restaurará tu partida.',side:'top'}},
   {element:'[data-game-tour="funding"]',popover:{title:'2. Financia el laboratorio',description:'Pulsa esta inversión para asignarla al plan. Reservar presupuesto impulsa la cura; todavía no ejecuta el turno.',side:'top'}},
   {element:'[data-game-tour="operation"]',popover:{title:'3. Abre la operación de campo',description:'Apareció un minijuego: el día está bloqueado hasta completarlo. Pulsa «Realizar minijuego». Contención trata infectados, extracción protege población y laboratorio ayuda a la cura.',side:'top'}},
   {element:'.field-operations',popover:{title:'4. Completa el minijuego',description:'Neutraliza los 8 objetivos en Perímetro cero para obtener la recompensa. Salir o perder no equivale a completarlo.',side:'top'}},
   {element:'[data-game-tour="advance"]',popover:{title:'5. Ejecuta el plan',description:'La operación ya está completada y el día se ha desbloqueado. Pulsa «Avanzar un día». Verás el resumen de la práctica y recuperarás tu partida original.',side:'top'}}, 
  ]});
  instance.current=tour;tour.drive(step);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();tour.destroy();}};
  document.addEventListener('keydown',escape,true);
  return()=>{cleaning=true;document.removeEventListener('keydown',escape,true);tour.destroy();if(instance.current===tour)instance.current=null;};
 },[active]);
 useEffect(()=>{if(active&&instance.current?.getActiveIndex()!==step)instance.current?.moveTo(step);},[active,step]);
 return null;
}
