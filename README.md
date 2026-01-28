# VirtualTwin

Proyecto base para un **Virtual Twin** orientado a visualización y prueba de interfaces. Actualmente incluye una maqueta HTML con simulación visual en canvas, panel de control, *popups* de parámetros/estado y ajustes de escalado responsivo.

## Contenido

- `UIpruebav10_popups_params_hw_console_scaling.html`: prototipo principal de la interfaz.

## Qué incluye la maqueta

- **Vista del sistema (canvas)** con una simulación visual del flujo del pipeline.
- **Panel derecho de control y variables** con:
  - Botones de iniciar/pausar/reset y aplicación de configuración.
  - Parámetros operativos (tiempos, volúmenes, velocidad de motores, capacidad de consumibles).
  - Estado en vivo del sistema (modo, válvulas, colas, placas, tips, alarmas).
- **Overlay de electrónica** con opciones de visualización (luces y etiquetas).
- **Consola de eventos** con log en tiempo real.
- **Ventanas emergentes** para mostrar parámetros, electrónica y consola en paneles separados.
- **Escalado responsivo del canvas** y modo “panel oculto” para maximizar el área de simulación.

## Cómo funciona la aplicación HTML

- **Motor de simulación en loop**: el navegador ejecuta un ciclo de actualización por frame que mueve el colector, las pipetas y las placas, y sincroniza el estado del UI.
- **Estados principales**:
  - `IDLE`: pausa o estado inicial.
  - `RUNNING`: ejecución activa de la simulación.
  - `DONE`: pipeline completo sin racks ni placas pendientes.
  - `ERROR`: se activa cuando algún consumible o capacidad supera su límite.
- **Flujo general del pipeline**:
  1. El **colector** procesa columnas y llena racks.
  2. Los racks pasan a **alícuotas** (pipeta A) y alimentan microplacas.
  3. Las placas avanzan por **buffer** y estación 2.
  4. La **pipeta de reactivo** (pipeta R) completa las placas y las apila.
- **Alarmas y límites**: si se agotan tips, racks, placas o se supera capacidad de descarte líquido/tips, el modo pasa a `ERROR` y se registra en la consola.
- **Popups sincronizados**: las ventanas de parámetros, electrónica y consola reciben un “snapshot” del estado para seguir en vivo.

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox, Safari).

## Uso rápido

1. Abrí el archivo `UIpruebav10_popups_params_hw_console_scaling.html` en tu navegador.
2. Usá **Iniciar/Pausar/Reset** para controlar la simulación.
3. Ajustá los parámetros (volúmenes, velocidades, cantidades) y aplicá cambios con **Aplicar config**.
4. Probá las **ventanas separadas** y el **modo panel oculto** si necesitás más espacio para el canvas.
5. Revisá la **consola** para ver eventos y cambios de estado.
6. Si aparece una alarma, ejecutá **Reset** para reiniciar el ciclo.

## Parámetros principales (referencia rápida)

- **Time-warp**: acelera o desacelera el tiempo de simulación.
- **Columnas/volúmenes**: controla columnas a analizar, lavado y volúmenes de gotas/fracciones.
- **Velocidades XY**: define velocidades de colector y pipetas.
- **Consumibles**: tips (small/large), racks, placas y capacidad de descartes.
- **Reservorios**: volumen inicial de reactivo y límites de descarte.

## Objetivos del repositorio

- Servir como base para iterar el diseño y comportamiento de un Virtual Twin.
- Mantener una única fuente de verdad para el prototipo visual.

## Próximos pasos sugeridos

- Incorporar assets (íconos, imágenes) y estilos finales.
- Separar lógica en archivos CSS/JS dedicados para facilitar el mantenimiento.
- Agregar un README más detallado con flujo de datos y casos de uso.
