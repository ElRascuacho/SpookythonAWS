import {useEffect,useRef} from 'react';
import {driver,type Driver} from 'driver.js';
import 'driver.js/dist/driver.css';
import '../components/GameGuidedTour.css';
export type ResearchTourStep=0|1|2|3|4|5;
/** Only validated application events can change the controlled step. No automatic API calls. */
export function ResearchGuidedTour({step,onCancel}:{step:ResearchTourStep|null;onCancel:()=>void}){
 const instance=useRef<Driver|null>(null),cancel=useRef(onCancel);cancel.current=onCancel;
 const active=step!==null;
 useEffect(()=>{
  if(!active)return;
  let cleaning=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tour=driver({animate:!reduced,smoothScroll:!reduced,disableActiveInteraction:false,advanceOnClick:false,allowKeyboardControl:false,allowClose:true,overlayClickBehavior:()=>{},overlayColor:'#061017',overlayOpacity:.72,showButtons:['close'],showProgress:true,progressText:'{{current}} de {{total}}',closeBtnLabel:'Salir del recorrido de Investigación',popoverClass:'game-guided-popover research-guided-popover',onNextClick:()=>{},onPrevClick:()=>{},onCloseClick:()=>stop(),onHighlighted:el=>{if(el instanceof HTMLElement)el.focus({preventScroll:true});},onDestroyed:()=>{instance.current=null;if(!cleaning)cancel.current();},steps:[
   {element:'[data-research-tour="scenario"]',popover:{title:'1. Explora el escenario',description:'Pulsa Escenario para ver parámetros, semilla y presupuesto. Investigación es independiente de tu partida: no tiene recompensas ni condiciones de victoria.',side:'bottom'}},
   {element:'[data-research-tour="agent"]',popover:{title:'2. Abre el agente',description:'Pulsa Agente. Sus propuestas se revisan y confirman manualmente antes de ejecutar. El tour no activará micrófono ni enviará consultas a la IA.',side:'bottom'}},
   {element:'[data-research-tour="prompt"]',popover:{title:'3. Conoce el cuadro de consulta',description:'Aquí puedes formular hipótesis y pedir medidas al agente. Haz clic o toca el cuadro de texto para continuar; con teclado, pulsa Enter. No necesitas escribir ni enviar una consulta. El recorrido no consume la API y conserva tu texto anterior.',side:'top'}},
   {element:'[data-research-tour="evolution"]',popover:{title:'4. Consulta la evolución',description:'Pulsa Evolución. La gráfica muestra solo días observados. Preparar ejecución y avanzar son acciones manuales; comparar réplicas también requiere tu decisión. Los resultados son exploratorios, no evidencia clínica.',side:'bottom'}},
   {element:'[data-research-tour="file"]',popover:{title:'5. Abre el archivo',description:'Pulsa Archivo. Aquí puedes guardar, importar y exportar la configuración. Copiar del juego solo copia parámetros iniciales, nunca su estado epidemiológico.',side:'bottom'}},
   {element:'[data-research-tour="export"]',popover:{title:'6. Conserva tu experimento',description:'Pulsa Exportar para descargar el JSON real de tu configuración. No ejecuta simulaciones ni evaluaciones. El recorrido termina solo si la configuración se valida y la descarga se solicita correctamente.',side:'bottom'}},
  ]});const stop=()=>{cleaning=true;tour.destroy();cancel.current();};instance.current=tour;tour.drive(0);
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();stop();}};document.addEventListener('keydown',escape,true);
  return()=>{cleaning=true;document.removeEventListener('keydown',escape,true);tour.destroy();instance.current=null;};
 },[active]);
 useEffect(()=>{if(step!==null&&instance.current&&instance.current.getActiveIndex()!==step)instance.current.moveTo(step);},[step]);
 return null;
}
