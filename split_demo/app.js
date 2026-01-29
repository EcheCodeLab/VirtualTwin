(() => {
  // ---------- Utils ----------
  const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const nowISO = ()=> new Date().toISOString().slice(11,19);

  // ---------- UI ----------
  const el = (id)=>document.getElementById(id);
  const canvas = el("sim");
  const ctx = canvas.getContext("2d");
  const logEl = el("log");
  const hwListEl = el("hwList");

  const vState = el("vState");
  const vValve = el("vValve");
  const vCollector = el("vCollector");
  const vAliquot = el("vAliquot");
  const vReagent = el("vReagent");
  const vQueues = el("vQueues");
  const vPlates = el("vPlates");
  const vMag = el("vMag");
  const vTips = el("vTips");
  const vWaste = el("vWaste");
  const vAlarm = el("vAlarm");
  const vBoxes = el("vBoxes");

  const timeScaleEl = el("timeScale");
  const vTimeScale = el("vTimeScale");

  const showElecEl = el("showElec");
  const showHwLedsEl = el("showHwLeds");
  const showHwLabelsEl = el("showHwLabels");
  const viewEngineeringEl = el("viewEngineering");

  const dashThroughput = el("dashThroughput");
  const dashEta = el("dashEta");
  const dashConsumables = el("dashConsumables");
  const dashWaste = el("dashWaste");
  const dashTips = el("dashTips");
  const dashPlates = el("dashPlates");
  const dashRisk = el("dashRisk");
  const engTooltip = el("engTooltip");

  // ---------- Panel docking (hide aside to maximize canvas) ----------
  const btnTogglePanel = el("btnTogglePanel");
  const miniBar = document.getElementById("miniBar");
  const miniStart = document.getElementById("miniStart");
  const miniPause = document.getElementById("miniPause");
  const miniReset = document.getElementById("miniReset");
  const miniShowPanel = document.getElementById("miniShowPanel");

  const miniPopConfig = document.getElementById("miniPopConfig");
  const miniPopHW = document.getElementById("miniPopHW");
  const miniPopLog = document.getElementById("miniPopLog");
  const miniPopLayout = document.getElementById("miniPopLayout");

  // ---------- Responsive canvas scaling (uniform; evita deformación) ----------
  const BASE_CANVAS_W = canvas.width;
  const BASE_CANVAS_H = canvas.height;

  function resizeSimCanvas(){
    // Calcular el rectángulo disponible en pantalla y escalar el canvas sin distorsión (letterbox si hace falta).
    const card = canvas.closest("section.card") || canvas.parentElement;
    const cardRect = card.getBoundingClientRect();
    const h2 = card.querySelector("h2");
    const h2h = h2 ? h2.getBoundingClientRect().height : 0;

    // Margen interno aproximado (padding de .wrap y card)
    const availW = Math.max(240, cardRect.width - 24);
    const availH = Math.max(240, window.innerHeight - cardRect.top - h2h - 28);

    const s = Math.max(0.10, Math.min(availW / BASE_CANVAS_W, availH / BASE_CANVAS_H));
    canvas.style.width  = Math.floor(BASE_CANVAS_W * s) + "px";
    canvas.style.height = Math.floor(BASE_CANVAS_H * s) + "px";
  }

  window.addEventListener("resize", resizeSimCanvas);
  window.addEventListener("orientationchange", resizeSimCanvas);

  // --- NEW --- Engineering mouse tooltip
  function getCanvasMousePos(ev){
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;
    return { x, y };
  }

  function updateEngTooltip(ev){
    if (!viewEngineeringEl.checked){
      engTooltip.style.display = "none";
      return;
    }
    const px = getCanvasMousePos(ev);
    const mm = { x: px.x / world.mmToPx, y: px.y / world.mmToPx };
    updateEngineeringHover(mm, px);
    const mod = engState.closestModule;
    if (!mod){
      engTooltip.style.display = "none";
      return;
    }
    engTooltip.innerHTML = `<b>${mod.name}</b><br/>mm: ${mm.x.toFixed(1)}, ${mm.y.toFixed(1)}<br/>px: ${px.x.toFixed(0)}, ${px.y.toFixed(0)}`;
    engTooltip.style.display = "block";
    engTooltip.style.left = `${px.x}px`;
    engTooltip.style.top = `${px.y}px`;
  }

  function hideEngTooltip(){
    engTooltip.style.display = "none";
  }

  canvas.addEventListener("mousemove", updateEngTooltip);
  canvas.addEventListener("mouseleave", hideEngTooltip);


  let panelHiddenManual = false;
  let panelHiddenForced = false;

  let _lastPanelHidden = null;
  function applyPanelState(){
    const hidden = panelHiddenForced || panelHiddenManual;
    if (_lastPanelHidden !== hidden){
      document.body.classList.toggle("panel-hidden", hidden);
      _lastPanelHidden = hidden;
      requestAnimationFrame(resizeSimCanvas);
    }
    if (btnTogglePanel) btnTogglePanel.textContent = hidden ? "Mostrar panel" : "Ocultar panel";
  }
  function setPanelForced(v){
    panelHiddenForced = !!v;
    applyPanelState();
  }
  function togglePanelManual(){
    panelHiddenManual = !panelHiddenManual;
    applyPanelState();
  }

  if (btnTogglePanel) btnTogglePanel.addEventListener("click", togglePanelManual);

  // Mini toolbar buttons (visible only when panel is hidden)
  if (miniStart) miniStart.addEventListener("click", () => start());
  if (miniPause) miniPause.addEventListener("click", () => pauseToggle());
  if (miniReset) miniReset.addEventListener("click", () => resetAll());
  if (miniShowPanel) miniShowPanel.addEventListener("click", () => { panelHiddenManual = false; applyPanelState(); });
  if (miniPopConfig) miniPopConfig.addEventListener("click", () => openCfgPopup());
  if (miniPopHW) miniPopHW.addEventListener("click", () => openHWPopup());
  if (miniPopLog) miniPopLog.addEventListener("click", () => openLogPopup());
  if (miniPopLayout) miniPopLayout.addEventListener("click", () => openLayoutPopup());

  applyPanelState();
  resizeSimCanvas();


  function log(msg, kind="muted") {
    const line = document.createElement("div");
    line.innerHTML = `<span class="${kind}">${nowISO()}</span> ${msg}`;
    logEl.prepend(line);
    while (logEl.childNodes.length > 220) logEl.removeChild(logEl.lastChild);
  }

  // ---------- Config ----------
  let cfg = {
    numColumns: 4,
    wash_uL: 1500,
    washFlow_uL_s: 1200,

    N: 6, M: 8,
    target_uL: 500,
    drop_uL: 25,
    dropRate_hz: 2.5,

    speedCollector: 120,
    speedPipA: 175,
    speedPipR: 175,

    aliquot_uL: 50,
    reagent_uL: 200,
    pipetteCapR_uL: 1000,

    // tiempos (s)
    t_tip_pick: 0.28,
    t_tip_drop: 0.22,
    t_aspirate: 0.33,
    t_dispense: 0.28,

    // consumibles
    plateSupply: 12,
    plateStackCap: 20,
    plateBufferCap: 6,

    rackSupply: 10,

    // tip boxes
    smallBoxes: 3,
    largeBoxes: 2,

    wasteTipCap: 400,
    wasteLiqCap_uL: 350000,
    reagentReservoirStart_uL: 80000
  };

  // ---------- World (mm) ----------
  // Re-layout: más aire entre módulos (menos “apretado”)
  const world = {
    mmToPx: 1.00,

    columnOut:      { x: 90,  y: 60  },
    collectorHome:  { x: 95,  y: 120 },
    rackCollectOrigin:{ x: 210, y: 220 },
    rackPipetteOrigin:{ x: 560, y: 360 },
    tubePitch: 18,

    pipAHome: { x: 740, y: 130 },
    pipRHome: { x: 1030,y: 130 },

    plateSt1: { x: 820, y: 220 },
    plateSt2: { x: 1130,y: 220 },
    wellPitch: 10,

    plateBufferPos: { x: 980, y: 360 },
    plateStackPos:  { x: 1240,y: 360 },

    conveyorY: 500,

    // Tip boxes más abajo y separados
    smallBoxTLs: [
      {x: 600, y: 540}, {x: 780, y: 540}, {x: 960, y: 540},
      {x: 600, y: 625}, {x: 780, y: 625}, {x: 960, y: 625},
    ],
    largeBoxTLs: [
      {x: 1080, y: 540}, {x: 1210, y: 540},
      {x: 1080, y: 625}, {x: 1210, y: 625},
    ],
    tipPitchSmall: 8.5,
    tipPitchLarge: 11.5,

    reservoir: { x: 1120, y: 430 },
    waste:     { x: 980,  y: 660 },
    washWaste: { x: 40,   y: 660 },

    plateMag: { x: 1230, y: 660 },
    rackMag:  { x: 1160, y: 660 },

    controllerBox: { x: 40, y: 180 }
  };

  const mm2px = (p)=>({ x: p.x*world.mmToPx, y: p.y*world.mmToPx });

  // --- NEW --- Engineering layout model (separado de world)
  let layout = { modules: [] };

  function buildLayoutFromWorld(){
    const modules = [
      { id: "column_out", name: "Salida columnas", x_mm: world.columnOut.x-20, y_mm: world.columnOut.y-20, w_mm: 80, h_mm: 60, z_mm: 0, notes: "Válvula + salida columnas" },
      { id: "collector_home", name: "Colector home", x_mm: world.collectorHome.x-30, y_mm: world.collectorHome.y-30, w_mm: 90, h_mm: 90, z_mm: 0, notes: "Cabezal colector" },
      { id: "rack_collect", name: "Rack colecta", x_mm: world.rackCollectOrigin.x-40, y_mm: world.rackCollectOrigin.y-40, w_mm: 140, h_mm: 140, z_mm: 0, notes: "Rack entrada" },
      { id: "rack_pip", name: "Rack pipeteo", x_mm: world.rackPipetteOrigin.x-40, y_mm: world.rackPipetteOrigin.y-40, w_mm: 140, h_mm: 140, z_mm: 0, notes: "Rack en estación" },
      { id: "pipA", name: "Pipeta A", x_mm: world.pipAHome.x-40, y_mm: world.pipAHome.y-40, w_mm: 90, h_mm: 90, z_mm: 120, notes: "Alícuotas" },
      { id: "pipR", name: "Pipeta R", x_mm: world.pipRHome.x-40, y_mm: world.pipRHome.y-40, w_mm: 90, h_mm: 90, z_mm: 120, notes: "Reactivo" },
      { id: "plate_st1", name: "Placa ST1", x_mm: world.plateSt1.x-55, y_mm: world.plateSt1.y-55, w_mm: 130, h_mm: 130, z_mm: 0, notes: "Estación 1" },
      { id: "plate_st2", name: "Placa ST2", x_mm: world.plateSt2.x-55, y_mm: world.plateSt2.y-55, w_mm: 130, h_mm: 130, z_mm: 0, notes: "Estación 2" },
      { id: "plate_buffer", name: "Buffer placas", x_mm: world.plateBufferPos.x-45, y_mm: world.plateBufferPos.y-45, w_mm: 110, h_mm: 110, z_mm: 0, notes: "Buffer intermedio" },
      { id: "plate_stack", name: "Stack final", x_mm: world.plateStackPos.x-45, y_mm: world.plateStackPos.y-45, w_mm: 110, h_mm: 110, z_mm: 0, notes: "Stack final" },
      { id: "reservoir", name: "Reservorio", x_mm: world.reservoir.x-35, y_mm: world.reservoir.y-35, w_mm: 90, h_mm: 90, z_mm: 0, notes: "Reactivo" },
      { id: "waste", name: "Waste", x_mm: world.waste.x-35, y_mm: world.waste.y-35, w_mm: 90, h_mm: 90, z_mm: 0, notes: "Descarte" },
      { id: "wash", name: "Waste lavado", x_mm: world.washWaste.x-30, y_mm: world.washWaste.y-30, w_mm: 80, h_mm: 80, z_mm: 0, notes: "Lavado columnas" },
      { id: "plate_mag", name: "Mag. placas", x_mm: world.plateMag.x-35, y_mm: world.plateMag.y-35, w_mm: 90, h_mm: 90, z_mm: 0, notes: "Magazine placas" },
      { id: "rack_mag", name: "Mag. racks", x_mm: world.rackMag.x-35, y_mm: world.rackMag.y-35, w_mm: 90, h_mm: 90, z_mm: 0, notes: "Magazine racks" },
      { id: "controller", name: "Controlador", x_mm: world.controllerBox.x-30, y_mm: world.controllerBox.y-30, w_mm: 80, h_mm: 80, z_mm: 0, notes: "Electrónica" }
    ];

    world.smallBoxTLs.forEach((tl, idx) => {
      modules.push({ id: `tips_small_${idx+1}`, name: `Tip box SMALL ${idx+1}`, x_mm: tl.x-8, y_mm: tl.y-8, w_mm: 120, h_mm: 90, z_mm: 0, notes: "Cajas tips SMALL" });
    });
    world.largeBoxTLs.forEach((tl, idx) => {
      modules.push({ id: `tips_large_${idx+1}`, name: `Tip box LARGE ${idx+1}`, x_mm: tl.x-8, y_mm: tl.y-8, w_mm: 95, h_mm: 70, z_mm: 0, notes: "Cajas tips LARGE" });
    });

    layout.modules = modules;
  }

  // --- NEW --- I/O map base
  const ioMap = [
    { id: "io_drop_sensor", label: "Sensor gotas", kind: "SENSOR", signal: "DI", endpoint: "PLC:DI_12", update_hz: 50, latency_ms: 10, criticality: "HIGH", notes: "Cuenta gotas en colector" },
    { id: "io_valve_servo", label: "Servo válvula", kind: "ACTUATOR", signal: "PWM", endpoint: "MCU:PWM_2", update_hz: 30, latency_ms: 25, criticality: "MED", notes: "Selector de columna" },
    { id: "io_collector_xy", label: "Motores XY colector", kind: "ACTUATOR", signal: "ETH", endpoint: "DRIVE:XY_COL", update_hz: 100, latency_ms: 12, criticality: "HIGH", notes: "Interpolación lineal" },
    { id: "io_pipA_xy", label: "Motores XY pipeta A", kind: "ACTUATOR", signal: "ETH", endpoint: "DRIVE:XY_PIPA", update_hz: 120, latency_ms: 10, criticality: "HIGH", notes: "Alícuotas" },
    { id: "io_pipR_xy", label: "Motores XY pipeta R", kind: "ACTUATOR", signal: "ETH", endpoint: "DRIVE:XY_PIPR", update_hz: 120, latency_ms: 10, criticality: "HIGH", notes: "Reactivo" },
    { id: "io_tip_sensor_A", label: "Sensor tip A", kind: "SENSOR", signal: "DI", endpoint: "PLC:DI_05", update_hz: 20, latency_ms: 15, criticality: "MED", notes: "Detección tip A" },
    { id: "io_tip_sensor_R", label: "Sensor tip R", kind: "SENSOR", signal: "DI", endpoint: "PLC:DI_06", update_hz: 20, latency_ms: 15, criticality: "MED", notes: "Detección tip R" },
    { id: "io_res_level", label: "Sensor nivel reservorio", kind: "SENSOR", signal: "AI", endpoint: "PLC:AI_02", update_hz: 5, latency_ms: 50, criticality: "HIGH", notes: "Nivel reactivo" },
    { id: "io_waste_level", label: "Sensor nivel descarte", kind: "SENSOR", signal: "AI", endpoint: "PLC:AI_03", update_hz: 5, latency_ms: 50, criticality: "HIGH", notes: "Tips + líquido" },
    { id: "io_rack_conv", label: "Motor cinta rack", kind: "ACTUATOR", signal: "DO", endpoint: "PLC:DO_08", update_hz: 10, latency_ms: 30, criticality: "MED", notes: "Traslado racks" },
    { id: "io_plate_conv", label: "Motor cinta placas", kind: "ACTUATOR", signal: "DO", endpoint: "PLC:DO_09", update_hz: 10, latency_ms: 30, criticality: "MED", notes: "Traslado placas" }
  ];

  buildLayoutFromWorld();

  // ---------- Tip positions ----------
  function currentSmallBoxTL() {
    const i = Math.min(sim.smallBoxSlot, world.smallBoxTLs.length - 1);
    return world.smallBoxTLs[i];
  }
  function currentLargeBoxTL() {
    const i = Math.min(sim.largeBoxSlot, world.largeBoxTLs.length - 1);
    return world.largeBoxTLs[i];
  }

  function tipIndexToPosSmall(idx){
    const tl = currentSmallBoxTL();
    const r = Math.floor(idx/12), c = idx%12;
    return { x: tl.x + c*world.tipPitchSmall, y: tl.y + r*world.tipPitchSmall };
  }
  function tipIndexToPosLarge(idx){
    const tl = currentLargeBoxTL();
    const r = Math.floor(idx/6), c = idx%6;
    return { x: tl.x + c*world.tipPitchLarge, y: tl.y + r*world.tipPitchLarge };
  }

  // ---------- Movement ----------
  function moveObj(obj, dt, speed){
    const dx = obj.tx - obj.x, dy = obj.ty - obj.y;
    const dist = Math.hypot(dx,dy);
    if (dist < 0.02) { obj.x=obj.tx; obj.y=obj.ty; return true; }
    const step = speed*dt;
    const a = Math.min(1, step/dist);
    obj.x += dx*a; obj.y += dy*a;
    return a >= 1;
  }

  // ---------- Helpers ----------
  function tubeIJ(k){ return { i: Math.floor(k/cfg.M), j: k%cfg.M }; }
  function tubePosMM(rack, k){
    const {i,j} = tubeIJ(k);
    return { x: rack.x + j*world.tubePitch, y: rack.y + i*world.tubePitch };
  }
  function wellPosMM(base, w){
    const r = Math.floor(w/12), c = w%12;
    return { x: base.x + c*world.wellPitch, y: base.y + r*world.wellPitch };
  }

  // ---------- Entities ----------
  let ids = { rack: 1, plate: 1 };
  function newRack(){
    return {
      id: ids.rack++,
      x: world.rackCollectOrigin.x,
      y: world.rackCollectOrigin.y,
      tubes_uL: new Array(cfg.N*cfg.M).fill(0),
      tubeIndex: 0,
      fracIndex: 0,
      drops: 0,
      frac_uL: 0,
      dropAcc: 0,
      moving: false,
      moveT: 0
    };
  }
  function newPlate(){
    return {
      id: ids.plate++,
      wells_uL: new Array(96).fill(0),
      wellsUsed: 0
    };
  }

  // ---------- Simulation ----------
  let sim = {
    mode: "IDLE",
    time: 0,
    alarm: null,

    runReport: [],

    plateSupply: cfg.plateSupply,
    rackSupply: cfg.rackSupply,
    reservoir_uL: cfg.reagentReservoirStart_uL,
    wasteTipCount: 0,
    wasteLiquid_uL: 0,

    smallBoxesTotal: cfg.smallBoxes,
    largeBoxesTotal: cfg.largeBoxes,
    smallBoxSlot: 0,
    largeBoxSlot: 0,
    tipsSmallUsed: new Array(96).fill(false),
    tipsLargeUsed: new Array(24).fill(false),

    rackQueue: [],
    plateBuffer: [],
    stackedPlates: 0,

    plateSt1: null,
    plateSt2: null,

    movingPlate: null,

    valveChannel: 1,
    valveServoDeg: 0,
    valveActiveT: 0,

    collectorHead: { x: world.collectorHome.x, y: world.collectorHome.y, tx: world.collectorHome.x, ty: world.collectorHome.y },

    pipA: { x: world.pipAHome.x, y: world.pipAHome.y, tx: world.pipAHome.x, ty: world.pipAHome.y,
            hasTip:false, tipType:"NONE", volInTip:0, phaseT:0, sub:"WAIT_RACK", w:0, rack:null, _tipIdx:-1 },

    pipR: { x: world.pipRHome.x, y: world.pipRHome.y, tx: world.pipRHome.x, ty: world.pipRHome.y,
            hasTip:false, tipType:"NONE", volInTip:0, phaseT:0, sub:"WAIT_PLATE", w:0, tipIdx:-1 },

    collector: {
      state: "WAIT_START",
      currentColumnIdx: 0,
      rack: null,
      washed_uL: 0
    },

    hw: []
  };

  // ---------- Alarms + waste ----------
  function setAlarm(code, detail){
    sim.alarm = { code, detail };
    sim.mode = "ERROR";
    log(`<b>ALARM</b> ${code}: ${detail}`, "status-bad");
  }
  function addWasteTip(){
    sim.wasteTipCount++;
    if (sim.wasteTipCount > cfg.wasteTipCap) { setAlarm("WASTE_TIPS_FULL", `Descarte tips excedió cap=${cfg.wasteTipCap}`); return false; }
    return true;
  }
  function addWasteLiquid(uL){
    sim.wasteLiquid_uL += Math.max(0, uL);
    if (sim.wasteLiquid_uL > cfg.wasteLiqCap_uL) { setAlarm("WASTE_LIQUID_FULL", `Descarte líquido excedió cap=${cfg.wasteLiqCap_uL} µL`); return false; }
    return true;
  }

  // ---------- Tip box logic ----------
  function nextTipSmall(){ for (let i=0;i<sim.tipsSmallUsed.length;i++) if (!sim.tipsSmallUsed[i]) return i; return -1; }
  function nextTipLarge(){ for (let i=0;i<sim.tipsLargeUsed.length;i++) if (!sim.tipsLargeUsed[i]) return i; return -1; }
  function tipsRemaining(arr){ return arr.reduce((acc,u)=>acc+(u?0:1), 0); }

  function loadNextSmallBox(){
    sim.smallBoxSlot++;
    if (sim.smallBoxSlot >= sim.smallBoxesTotal) { setAlarm("TIPS_SMALL_BOXES_EMPTY", "Se agotaron las cajas de tips SMALL."); return false; }
    sim.tipsSmallUsed = new Array(96).fill(false);
    log(`Tips SMALL: caja agotada → cambiando a caja #${sim.smallBoxSlot+1}/${sim.smallBoxesTotal}.`, "status-warn");
    return true;
  }
  function loadNextLargeBox(){
    sim.largeBoxSlot++;
    if (sim.largeBoxSlot >= sim.largeBoxesTotal) { setAlarm("TIPS_LARGE_BOXES_EMPTY", "Se agotaron las cajas de tips LARGE."); return false; }
    sim.tipsLargeUsed = new Array(24).fill(false);
    log(`Tips LARGE: caja agotada → cambiando a caja #${sim.largeBoxSlot+1}/${sim.largeBoxesTotal}.`, "status-warn");
    return true;
  }

  // ---------- Valve ----------
  function updateValve(channel){
    const changed = (channel !== sim.valveChannel);
    sim.valveChannel = channel;
    const denom = Math.max(1, cfg.numColumns);
    sim.valveServoDeg = Math.round((channel/denom)*180);
    if (changed) sim.valveActiveT = 0.6;
  }

  // ---------- Plate conveyor ----------
  function requestPlateMove(plate, from, to, speed, onDone){
    if (sim.movingPlate) return false;
    sim.movingPlate = { plate, from, to, t:0, speed, onDone };
    return true;
  }
  function stepPlateMove(dt){
    if (!sim.movingPlate) return;
    sim.movingPlate.t = clamp(sim.movingPlate.t + dt*sim.movingPlate.speed, 0, 1);
    if (sim.movingPlate.t >= 1){
      const done = sim.movingPlate.onDone;
      sim.movingPlate = null;
      if (done) done();
    }
  }

  // ---------- Collector SM ----------
  function stepCollector(dt){
    const C = sim.collector;
    if (sim.mode !== "RUNNING") return;

    moveObj(sim.collectorHead, dt, cfg.speedCollector);

    switch(C.state){
      case "WAIT_START": C.state = "LOAD_RACK"; break;

      case "LOAD_RACK":
        if (C.currentColumnIdx >= cfg.numColumns) { C.state="DONE"; break; }
        if (!C.rack){
          if (sim.rackSupply <= 0) { setAlarm("RACK_EMPTY", "No hay racks Falcon en magazine."); return; }
          sim.rackSupply--;
          C.rack = newRack();
          log(`Colector: cargó rack ID=${C.rack.id} (columna ${C.currentColumnIdx+1}/${cfg.numColumns}).`, "status-ok");
        }
        C.state = "SELECT_COLUMN";
        break;

      case "SELECT_COLUMN": {
        updateValve(C.currentColumnIdx + 1);
        C.rack.tubeIndex = 0; C.rack.fracIndex = 1; C.rack.drops = 0; C.rack.frac_uL = 0; C.rack.dropAcc = 0;
        const tp = tubePosMM(C.rack, C.rack.tubeIndex);
        sim.collectorHead.tx = tp.x; sim.collectorHead.ty = tp.y;
        C.state = "MOVE_TO_TUBE";
        log(`Válvula → columna ${sim.valveChannel}/${cfg.numColumns} (servo ${sim.valveServoDeg}°).`, "status-ok");
        break;
      }

      case "MOVE_TO_TUBE": {
        const arrived = (Math.hypot(sim.collectorHead.tx-sim.collectorHead.x, sim.collectorHead.ty-sim.collectorHead.y) < 0.06);
        if (arrived) { C.rack.drops=0; C.rack.frac_uL=0; C.rack.dropAcc=0; C.state="COLLECTING"; }
        break;
      }

      case "COLLECTING": {
        if (cfg.dropRate_hz <= 0) { setAlarm("NO_DROPS", "dropRate=0 durante colecta."); return; }
        C.rack.dropAcc += cfg.dropRate_hz * dt;
        const newDrops = Math.floor(C.rack.dropAcc);
        if (newDrops > 0){
          C.rack.dropAcc -= newDrops;
          C.rack.drops += newDrops;
          C.rack.frac_uL += newDrops * cfg.drop_uL;
        }
        if (C.rack.frac_uL >= cfg.target_uL){
          sim.runReport.push({
            columnIdx: C.currentColumnIdx,
            fracIndex: C.rack.fracIndex,
            tubeIndex: C.rack.tubeIndex,
            timestamp_sim: sim.time,
            volumen_uL: cfg.target_uL,
            rackId: C.rack.id
          });
          C.rack.tubes_uL[C.rack.tubeIndex] += cfg.target_uL;
          C.rack.fracIndex++;
          C.rack.tubeIndex++;
          if (C.rack.tubeIndex >= cfg.N*cfg.M){
            C.rack.moving = true; C.rack.moveT = 0;
            C.state = "MOVE_RACK_TO_QUEUE";
            sim.collectorHead.tx = world.collectorHome.x; sim.collectorHead.ty = world.collectorHome.y;
            log(`Colector: rack ID=${C.rack.id} completo → transportando a estación pipeteo.`, "status-ok");
          } else {
            const tp = tubePosMM(C.rack, C.rack.tubeIndex);
            sim.collectorHead.tx = tp.x; sim.collectorHead.ty = tp.y;
            C.state = "MOVE_TO_TUBE";
          }
        }
        break;
      }

      case "MOVE_RACK_TO_QUEUE": {
        const r = C.rack;
        r.moveT = clamp(r.moveT + dt*0.45, 0, 1);
        r.x = lerp(world.rackCollectOrigin.x, world.rackPipetteOrigin.x, r.moveT);
        r.y = lerp(world.rackCollectOrigin.y, world.rackPipetteOrigin.y, r.moveT);
        if (r.moveT >= 1){
          r.moving=false;
          sim.rackQueue.push(r);
          log(`Rack ID=${r.id} en cola de alícuotas. (cola racks=${sim.rackQueue.length})`, "status-ok");

          const needWash = (C.currentColumnIdx < cfg.numColumns-1 && cfg.wash_uL > 0);
          C.rack = null;

          if (needWash){
            C.washed_uL = 0;
            C.state = "WASH";
            C.currentColumnIdx++;
          } else {
            C.currentColumnIdx++;
            C.state = "LOAD_RACK";
          }
        }
        break;
      }

      case "WASH": {
        sim.collectorHead.tx = world.washWaste.x; sim.collectorHead.ty = world.washWaste.y;
        const arrived = (Math.hypot(sim.collectorHead.tx-sim.collectorHead.x, sim.collectorHead.ty-sim.collectorHead.y) < 0.08);
        if (!arrived) break;
        updateValve(0);
        const inc = cfg.washFlow_uL_s * dt;
        C.washed_uL += inc;
        if (!addWasteLiquid(inc)) return;
        if (C.washed_uL >= cfg.wash_uL){
          log(`Lavado completado (${Math.round(cfg.wash_uL)} µL).`, "status-ok");
          C.state = "LOAD_RACK";
        }
        break;
      }

      case "DONE": break;
    }
  }

  // ---------- Aliquot SM ----------
  function ensurePlateSt1(){
    if (sim.plateSt1) return true;
    if (sim.plateSupply <= 0) { setAlarm("PLATE_EMPTY", "No hay microplacas en magazine."); return false; }
    sim.plateSupply--;
    sim.plateSt1 = newPlate();
    log(`Placa ID=${sim.plateSt1.id} cargada en Estación 1.`, "status-ok");
    return true;
  }

  function stepAliquot(dt){
    if (sim.mode !== "RUNNING") return;
    const A = sim.pipA;

    moveObj(A, dt, cfg.speedPipA);

    if (!A.rack && sim.rackQueue.length > 0){
      A.rack = sim.rackQueue.shift();
      A.w = 0;
      log(`Alícuotas: tomó rack ID=${A.rack.id} (cola racks=${sim.rackQueue.length}).`, "status-ok");
    }
    if (!A.rack){
      A.sub = "WAIT_RACK";
      A.tx = world.pipAHome.x; A.ty = world.pipAHome.y;
      return;
    }

    if (!ensurePlateSt1()) return;

    switch(A.sub){
      case "WAIT_RACK": A.sub="GET_TIP"; A.phaseT=0; break;

      case "GET_TIP": {
        let idx = nextTipSmall();
        if (idx < 0){
          if (!loadNextSmallBox()) return;
          idx = nextTipSmall();
          if (idx < 0) { setAlarm("TIPS_SMALL_UNEXPECTED", "Caja SMALL nueva sin tips disponibles."); return; }
        }
        const pos = tipIndexToPosSmall(idx);
        A.tx = pos.x; A.ty = pos.y;
        const arrived = (Math.hypot(A.tx-A.x, A.ty-A.y) < 0.08);
        if (arrived){
          A.phaseT += dt;
          if (A.phaseT >= cfg.t_tip_pick){
            A.phaseT = 0;
            sim.tipsSmallUsed[idx] = true;
            A.hasTip = true; A.tipType="SMALL"; A.volInTip=0;
            A._tipIdx = idx;
            A.sub = "MOVE_TO_SRC";
          }
        } else A.phaseT=0;
        break;
      }

      case "MOVE_TO_SRC": {
        if (A.w >= Math.min(96, cfg.N*cfg.M)){ A.sub = "FINISH_PLATE"; break; }
        const src = tubePosMM(A.rack, A.w);
        A.tx = src.x; A.ty = src.y;
        if (Math.hypot(A.tx-A.x, A.ty-A.y) < 0.08){ A.phaseT=0; A.sub="ASPIRATE"; }
        break;
      }

      case "ASPIRATE": {
        A.phaseT += dt;
        if (A.phaseT >= cfg.t_aspirate){
          A.phaseT = 0;
          if (A.rack.tubes_uL[A.w] >= cfg.aliquot_uL){
            A.rack.tubes_uL[A.w] -= cfg.aliquot_uL;
            A.volInTip = cfg.aliquot_uL;
          } else {
            A.volInTip = 0;
          }
          A.sub = "MOVE_TO_DST";
        }
        break;
      }

      case "MOVE_TO_DST": {
        const dst = wellPosMM(world.plateSt1, A.w);
        A.tx = dst.x; A.ty = dst.y;
        if (Math.hypot(A.tx-A.x, A.ty-A.y) < 0.08){ A.phaseT=0; A.sub="DISPENSE"; }
        break;
      }

      case "DISPENSE": {
        A.phaseT += dt;
        if (A.phaseT >= cfg.t_dispense){
          A.phaseT = 0;
          if (A.volInTip > 0){
            sim.plateSt1.wells_uL[A.w] += A.volInTip;
            sim.plateSt1.wellsUsed = Math.max(sim.plateSt1.wellsUsed, A.w+1);
          }
          A.volInTip = 0;
          A.sub = "DROP_TIP";
        }
        break;
      }

      case "DROP_TIP": {
        A.tx = world.waste.x; A.ty = world.waste.y;
        const arrived = (Math.hypot(A.tx-A.x, A.ty-A.y) < 0.08);
        if (arrived){
          A.phaseT += dt;
          if (A.phaseT >= cfg.t_tip_drop){
            A.phaseT=0;
            if (!addWasteTip()) return;
            if (!addWasteLiquid(A.volInTip)) return;
            A.hasTip=false; A.tipType="NONE"; A.volInTip=0; A._tipIdx=-1;
            A.w += 1;
            A.sub = "GET_TIP";
          }
        } else A.phaseT=0;
        break;
      }

      case "FINISH_PLATE": {
        if (sim.plateBuffer.length >= cfg.plateBufferCap){
          setAlarm("PLATE_BUFFER_FULL", `Buffer de placas lleno (cap=${cfg.plateBufferCap}).`);
          return;
        }
        const plate = sim.plateSt1;
        if (!plate){ A.sub="WAIT_RACK"; break; }

        const ok = requestPlateMove(
          plate,
          {x: world.plateSt1.x, y: world.plateSt1.y},
          {x: world.plateBufferPos.x, y: world.plateBufferPos.y},
          0.9,
          () => { sim.plateBuffer.push(plate); log(`Placa ID=${plate.id} → buffer (buffer=${sim.plateBuffer.length}).`, "status-ok"); }
        );
        if (!ok) { A.tx = world.pipAHome.x; A.ty = world.pipAHome.y; return; }

        sim.plateSt1 = null;

        log(`Alícuotas: terminó con rack ID=${A.rack.id} (consumido).`, "status-ok");
        A.rack = null;
        A.w = 0;
        A.sub = "WAIT_RACK";
        A.tx = world.pipAHome.x; A.ty = world.pipAHome.y;
        break;
      }
    }
  }

  // ---------- Plate dispatcher ----------
  function stepPlateDispatch(){
    if (sim.mode !== "RUNNING") return;
    if (sim.plateSt2) return;
    if (sim.plateBuffer.length <= 0) return;
    if (sim.movingPlate) return;

    const plate = sim.plateBuffer.shift();
    const ok = requestPlateMove(
      plate,
      {x: world.plateBufferPos.x, y: world.plateBufferPos.y},
      {x: world.plateSt2.x, y: world.plateSt2.y},
      1.0,
      () => { sim.plateSt2 = plate; log(`Placa ID=${plate.id} llegó a Estación 2.`, "status-ok"); }
    );
    if (!ok) sim.plateBuffer.unshift(plate);
  }

  // ---------- Reagent SM ----------
  function stepReagent(dt){
    if (sim.mode !== "RUNNING") return;
    const R = sim.pipR;

    moveObj(R, dt, cfg.speedPipR);

    if (!sim.plateSt2){
      R.sub = "WAIT_PLATE";
      R.tx = world.pipRHome.x; R.ty = world.pipRHome.y;
      return;
    }

    const plate = sim.plateSt2;

    if (plate.wellsUsed <= 0){
      if (sim.stackedPlates >= cfg.plateStackCap){ setAlarm("PLATE_STACK_FULL", `Stack final lleno (cap=${cfg.plateStackCap}).`); return; }
      if (sim.movingPlate) return;
      const ok = requestPlateMove(
        plate,
        {x: world.plateSt2.x, y: world.plateSt2.y},
        {x: world.plateStackPos.x, y: world.plateStackPos.y},
        0.9,
        () => { sim.stackedPlates++; log(`Placa ID=${plate.id} stackeada (vacía). Stack=${sim.stackedPlates}`, "status-ok"); }
      );
      if (ok) sim.plateSt2 = null;
      return;
    }

    switch(R.sub){
      case "WAIT_PLATE": R.w = 0; R.sub = "GET_TIP"; R.phaseT = 0; break;

      case "GET_TIP": {
        if (R.hasTip) { R.sub="MOVE_TO_RES"; break; }
        let idx = nextTipLarge();
        if (idx < 0){
          if (!loadNextLargeBox()) return;
          idx = nextTipLarge();
          if (idx < 0) { setAlarm("TIPS_LARGE_UNEXPECTED", "Caja LARGE nueva sin tips disponibles."); return; }
        }
        const pos = tipIndexToPosLarge(idx);
        R.tx = pos.x; R.ty = pos.y;
        const arrived = (Math.hypot(R.tx-R.x, R.ty-R.y) < 0.08);
        if (arrived){
          R.phaseT += dt;
          if (R.phaseT >= cfg.t_tip_pick){
            R.phaseT=0;
            sim.tipsLargeUsed[idx] = true;
            R.tipIdx = idx;
            R.hasTip=true; R.tipType="LARGE"; R.volInTip=0;
            R.w = 0;
            R.sub = "MOVE_TO_RES";
          }
        } else R.phaseT=0;
        break;
      }

      case "MOVE_TO_RES":
        R.tx = world.reservoir.x; R.ty = world.reservoir.y;
        if (Math.hypot(R.tx-R.x, R.ty-R.y) < 0.08){ R.phaseT=0; R.sub="ASPIRATE_RES"; }
        break;

      case "ASPIRATE_RES": {
        R.phaseT += dt;
        if (R.phaseT >= cfg.t_aspirate){
          R.phaseT=0;
          const remainingWells = Math.max(0, plate.wellsUsed - R.w);
          if (remainingWells <= 0){ R.sub="DROP_TIP_END"; break; }
          const need = remainingWells * cfg.reagent_uL;
          const take = Math.min(cfg.pipetteCapR_uL, need, sim.reservoir_uL);
          if (take <= 0){ setAlarm("RESERVOIR_EMPTY", "Reservorio de reactivo vacío."); return; }
          sim.reservoir_uL -= take;
          R.volInTip = take;
          R.sub = "MOVE_TO_WELL";
        }
        break;
      }

      case "MOVE_TO_WELL":
        if (R.w >= plate.wellsUsed){ R.sub="DROP_TIP_END"; break; }
        if (R.volInTip < cfg.reagent_uL){ R.sub="MOVE_TO_RES"; break; }
        {
          const wp = wellPosMM(world.plateSt2, R.w);
          R.tx = wp.x; R.ty = wp.y;
          if (Math.hypot(R.tx-R.x, R.ty-R.y) < 0.08){ R.phaseT=0; R.sub="DISPENSE_WELL"; }
        }
        break;

      case "DISPENSE_WELL": {
        R.phaseT += dt;
        if (R.phaseT >= cfg.t_dispense){
          R.phaseT=0;
          plate.wells_uL[R.w] += cfg.reagent_uL;
          R.volInTip -= cfg.reagent_uL;
          R.w++;
          R.sub = "MOVE_TO_WELL";
        }
        break;
      }

      case "DROP_TIP_END": {
        R.tx = world.waste.x; R.ty = world.waste.y;
        const arrived = (Math.hypot(R.tx-R.x, R.ty-R.y) < 0.08);
        if (arrived){
          R.phaseT += dt;
          if (R.phaseT >= cfg.t_tip_drop){
            R.phaseT=0;
            if (!addWasteTip()) return;
            if (!addWasteLiquid(R.volInTip)) return;
            R.hasTip=false; R.tipType="NONE"; R.volInTip=0; R.tipIdx=-1;

            if (sim.stackedPlates >= cfg.plateStackCap){ setAlarm("PLATE_STACK_FULL", `Stack final lleno (cap=${cfg.plateStackCap}).`); return; }
            if (sim.movingPlate) return;

            const ok = requestPlateMove(
              plate,
              {x: world.plateSt2.x, y: world.plateSt2.y},
              {x: world.plateStackPos.x, y: world.plateStackPos.y},
              0.9,
              () => { sim.stackedPlates++; log(`Placa ID=${plate.id} stackeada. Stack=${sim.stackedPlates}`, "status-ok"); }
            );
            if (ok){
              sim.plateSt2 = null;
              R.sub="WAIT_PLATE";
              R.tx = world.pipRHome.x; R.ty = world.pipRHome.y;
            }
          }
        } else R.phaseT=0;
        break;
      }
    }
  }

  // ---------- DONE detection ----------
  function updateDone(){
    const collectorDone = (sim.collector.state === "DONE" || (sim.collector.currentColumnIdx >= cfg.numColumns && sim.collector.rack === null));
    const pipelinesEmpty =
      (sim.rackQueue.length === 0) &&
      (!sim.pipA.rack) &&
      (!sim.plateSt1) &&
      (sim.plateBuffer.length === 0) &&
      (!sim.plateSt2) &&
      (!sim.movingPlate);

    if (collectorDone && pipelinesEmpty && sim.mode === "RUNNING"){
      sim.mode = "DONE";
      log("RUN completo: colector finalizó y no quedan placas/racks en pipeline.", "status-ok");
    }
  }

  // ---------- Hardware overlay ----------
  function computeHardware(dt){
    const comps = [];
    const add = (id, label, posMM, active, kind) => comps.push({ id, label, posMM, active, kind });

    sim.valveActiveT = Math.max(0, sim.valveActiveT - dt);

    const ch = sim.collectorHead;
    const dxC = Math.abs(ch.tx - ch.x), dyC = Math.abs(ch.ty - ch.y);
    add("col_x", "Motor X Colector", {x: ch.x+16, y: ch.y-20}, (sim.mode==="RUNNING" && dxC>0.10), "motor");
    add("col_y", "Motor Y Colector", {x: ch.x+16, y: ch.y-8},  (sim.mode==="RUNNING" && dyC>0.10), "motor");

    add("valve", "Servo válvula", {x: world.columnOut.x+26, y: world.columnOut.y-6}, sim.valveActiveT>0, "servo");
    add("drop",  "Sensor gotas",  {x: world.columnOut.x+26, y: world.columnOut.y+10}, sim.collector.state==="COLLECTING", "sensor");

    const washArr = (Math.hypot(world.washWaste.x - ch.x, world.washWaste.y - ch.y) < 0.20);
    add("wash_pump", "Bomba lavado", {x: world.washWaste.x+26, y: world.washWaste.y-10}, (sim.collector.state==="WASH" && washArr), "actuator");

    if (sim.collector.state==="MOVE_RACK_TO_QUEUE" && sim.collector.rack){
      const r = sim.collector.rack;
      add("rack_conv", "Motor cinta rack", {x: r.x+10, y: r.y-34}, true, "motor");
    } else {
      add("rack_conv", "Motor cinta rack", {x: world.rackPipetteOrigin.x+10, y: world.rackPipetteOrigin.y-34}, false, "motor");
    }

    add("plate_conv", "Motor cinta placas", {x: 650, y: world.conveyorY+5}, !!sim.movingPlate, "motor");

    const A = sim.pipA;
    const dxA = Math.abs(A.tx - A.x), dyA = Math.abs(A.ty - A.y);
    add("pipA_x", "Motor X Pipeta A", {x: A.x+16, y: A.y-20}, (sim.mode==="RUNNING" && dxA>0.10), "motor");
    add("pipA_y", "Motor Y Pipeta A", {x: A.x+16, y: A.y-8},  (sim.mode==="RUNNING" && dyA>0.10), "motor");
    add("pipA_tip", "Pick tip A",      {x: A.x-16, y: A.y-20}, (A.sub==="GET_TIP" && Math.hypot(A.tx-A.x, A.ty-A.y)<0.10), "actuator");
    add("pipA_pump","Aspiración A",    {x: A.x-16, y: A.y-8},  (A.sub==="ASPIRATE"), "actuator");
    add("pipA_valve","Dispense A",     {x: A.x-16, y: A.y+4},  (A.sub==="DISPENSE"), "actuator");
    add("pipA_eject","Eyect tip A",    {x: A.x-16, y: A.y+16}, (A.sub==="DROP_TIP" && Math.hypot(A.tx-A.x, A.ty-A.y)<0.10), "actuator");
    add("pipA_tipsense","Sensor tip A",{x: A.x+30, y: A.y+10}, A.hasTip, "sensor");

    const R = sim.pipR;
    const dxR = Math.abs(R.tx - R.x), dyR = Math.abs(R.ty - R.y);
    add("pipR_x", "Motor X Pipeta R", {x: R.x+16, y: R.y-20}, (sim.mode==="RUNNING" && dxR>0.10), "motor");
    add("pipR_y", "Motor Y Pipeta R", {x: R.x+16, y: R.y-8},  (sim.mode==="RUNNING" && dyR>0.10), "motor");
    add("pipR_tip", "Pick tip R",      {x: R.x-16, y: R.y-20}, (R.sub==="GET_TIP" && Math.hypot(R.tx-R.x, R.ty-R.y)<0.10), "actuator");
    add("pipR_pump","Aspiración R",    {x: R.x-16, y: R.y-8},  (R.sub==="ASPIRATE_RES"), "actuator");
    add("pipR_valve","Dispense R",     {x: R.x-16, y: R.y+4},  (R.sub==="DISPENSE_WELL"), "actuator");
    add("pipR_eject","Eyect tip R",    {x: R.x-16, y: R.y+16}, (R.sub==="DROP_TIP_END" && Math.hypot(R.tx-R.x, R.ty-R.y)<0.10), "actuator");
    add("pipR_tipsense","Sensor tip R",{x: R.x+30, y: R.y+10}, R.hasTip, "sensor");

    const low = sim.reservoir_uL < Math.max(1, cfg.reagent_uL*20);
    add("res_level", "Sensor nivel reservorio", {x: world.reservoir.x+22, y: world.reservoir.y-8},
        (R.sub==="ASPIRATE_RES" || R.sub==="MOVE_TO_RES" || low), "sensor");

    const wasteWarn = (sim.wasteTipCount > 0.8*cfg.wasteTipCap) || (sim.wasteLiquid_uL > 0.8*cfg.wasteLiqCap_uL);
    add("waste_level", "Sensor nivel descarte", {x: world.waste.x+22, y: world.waste.y-10}, wasteWarn, "sensor");

    sim.hw = comps;
  }

  // ---------- Rendering helpers ----------
  function drawLabel(text,x,y){
    ctx.save(); ctx.fillStyle="#9fb0c0"; ctx.font="12px system-ui"; ctx.fillText(text,x,y); ctx.restore();
  }
  function circle(x,y,r,fill,stroke="#223041"){
    ctx.save(); ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=fill; ctx.fill();
    ctx.lineWidth=1; ctx.strokeStyle=stroke; ctx.stroke(); ctx.restore();
  }
  function rect(x,y,w,h,stroke="#223041",fill=null, lw=2){
    ctx.save();
    if (fill){ ctx.fillStyle=fill; ctx.fillRect(x,y,w,h); }
    ctx.strokeStyle=stroke; ctx.lineWidth=lw; ctx.strokeRect(x,y,w,h);
    ctx.restore();
  }
  function crosshair(x,y,size,stroke){
    ctx.save(); ctx.strokeStyle=stroke; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(x-size,y); ctx.lineTo(x+size,y);
    ctx.moveTo(x,y-size); ctx.lineTo(x,y+size);
    ctx.stroke(); ctx.restore();
  }

  // --- NEW --- Engineering overlay helpers
  const engState = {
    mouseMM: null,
    mousePx: null,
    closestModule: null
  };

  function drawEngineeringGrid(){
    const spacing = 50;
    const sub = 10;
    const maxXmm = canvas.width / world.mmToPx;
    const maxYmm = canvas.height / world.mmToPx;

    ctx.save();
    ctx.lineWidth = 1;
    for (let x=0; x<=maxXmm; x+=sub){
      const px = x*world.mmToPx;
      ctx.strokeStyle = (x % spacing === 0) ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.07)";
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height); ctx.stroke();
    }
    for (let y=0; y<=maxYmm; y+=sub){
      const py = y*world.mmToPx;
      ctx.strokeStyle = (y % spacing === 0) ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.07)";
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(canvas.width, py); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEngineeringAxes(){
    ctx.save();
    ctx.strokeStyle = "rgba(232,240,247,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(90, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(30, 90); ctx.stroke();
    ctx.fillStyle = "rgba(232,240,247,0.7)";
    ctx.font = "11px system-ui";
    ctx.fillText("X→", 92, 34);
    ctx.fillText("Y↓", 20, 92);
    ctx.fillText("(0,0)", 36, 24);
    ctx.restore();
  }

  function drawLayoutBoxes(){
    for (const mod of layout.modules){
      const px = mm2px({ x: mod.x_mm, y: mod.y_mm });
      const w = mod.w_mm * world.mmToPx;
      const h = mod.h_mm * world.mmToPx;
      ctx.save();
      ctx.fillStyle = "rgba(59,130,246,0.08)";
      ctx.strokeStyle = "rgba(59,130,246,0.55)";
      ctx.lineWidth = 1.5;
      ctx.fillRect(px.x, px.y, w, h);
      ctx.strokeRect(px.x, px.y, w, h);
      ctx.fillStyle = "rgba(232,240,247,0.75)";
      ctx.font = "11px system-ui";
      ctx.fillText(mod.name, px.x + 4, px.y + 14);
      ctx.restore();
    }
  }

  function distanceToBox(mm, mod){
    const dx = Math.max(mod.x_mm - mm.x, 0, mm.x - (mod.x_mm + mod.w_mm));
    const dy = Math.max(mod.y_mm - mm.y, 0, mm.y - (mod.y_mm + mod.h_mm));
    return Math.hypot(dx, dy);
  }

  function updateEngineeringHover(mm, px){
    if (!layout.modules.length) return;
    let best = null;
    let bestD = Infinity;
    for (const mod of layout.modules){
      const d = distanceToBox(mm, mod);
      if (d < bestD){
        bestD = d;
        best = mod;
      }
    }
    engState.mouseMM = mm;
    engState.mousePx = px;
    engState.closestModule = best;
  }

  function drawPlateAt(posMM, plate){
    const tl = mm2px({x: posMM.x-18, y: posMM.y-18});
    const w = (12-1)*world.wellPitch*world.mmToPx + 36;
    const h = (8-1)*world.wellPitch*world.mmToPx + 36;
    rect(tl.x, tl.y, w, h);
    drawLabel(`Placa ${plate.id}`, tl.x, tl.y-10);
    for (let i=0;i<96;i++){
      const r = Math.floor(i/12), c=i%12;
      const p = mm2px({x: posMM.x + c*world.wellPitch, y: posMM.y + r*world.wellPitch});
      const vol = plate.wells_uL[i]||0;
      const denom = Math.max(1, cfg.aliquot_uL + cfg.reagent_uL);
      const f = clamp(vol/denom, 0, 1);
      const fill = vol>0 ? `rgba(59,130,246,${0.12 + 0.55*f})` : "rgba(148,163,184,0.06)";
      circle(p.x,p.y,4.5,fill);
    }
  }

  function drawRack(rack){
    const rackTL = mm2px({x: rack.x-24, y: rack.y-24});
    const rackW = (cfg.M-1)*world.tubePitch*world.mmToPx + 48;
    const rackH = (cfg.N-1)*world.tubePitch*world.mmToPx + 48;
    rect(rackTL.x, rackTL.y, rackW, rackH);
    drawLabel(`Rack ${rack.id}`, rackTL.x, rackTL.y-10);
    for (let k=0;k<cfg.N*cfg.M;k++){
      const p = mm2px(tubePosMM(rack, k));
      const vol = rack.tubes_uL[k]||0;
      const f = clamp(vol/cfg.target_uL, 0, 1);
      const fill = f>0 ? `rgba(74,222,128,${0.15+0.65*f})` : "rgba(148,163,184,0.08)";
      circle(p.x,p.y,7.3,fill);
    }
  }

  function drawTipBoxSmall(boxIdx, isActive){
    const tl = world.smallBoxTLs[Math.min(boxIdx, world.smallBoxTLs.length-1)];
    const px = mm2px(tl);
    const w = (12-1)*world.tipPitchSmall*world.mmToPx + 20;
    const h = (8-1)*world.tipPitchSmall*world.mmToPx + 20;
    rect(px.x-10, px.y-10, w, h, isActive ? "#4b6ea8" : "rgba(34,48,65,0.8)", null, isActive?3:2);
    drawLabel(`SMALL #${boxIdx+1}`, px.x-10, px.y-16);
    if (isActive){
      for (let i=0;i<96;i++){
        const pos = mm2px(tipIndexToPosSmall(i));
        const used = sim.tipsSmallUsed[i];
        circle(pos.x,pos.y,3.6, used ? "rgba(148,163,184,0.06)" : "rgba(232,240,247,0.10)");
      }
    } else {
      ctx.save(); ctx.fillStyle="rgba(232,240,247,0.05)"; ctx.font="11px system-ui"; ctx.fillText("…", px.x + 6, px.y + 12); ctx.restore();
    }
  }

  function drawTipBoxLarge(boxIdx, isActive){
    const tl = world.largeBoxTLs[Math.min(boxIdx, world.largeBoxTLs.length-1)];
    const px = mm2px(tl);
    const w = (6-1)*world.tipPitchLarge*world.mmToPx + 20;
    const h = (4-1)*world.tipPitchLarge*world.mmToPx + 20;
    rect(px.x-10, px.y-10, w, h, isActive ? "#4b6ea8" : "rgba(34,48,65,0.8)", null, isActive?3:2);
    drawLabel(`LARGE #${boxIdx+1}`, px.x-10, px.y-16);
    if (isActive){
      for (let i=0;i<24;i++){
        const pos = mm2px(tipIndexToPosLarge(i));
        const used = sim.tipsLargeUsed[i];
        circle(pos.x,pos.y,4.2, used ? "rgba(148,163,184,0.06)" : "rgba(232,240,247,0.10)");
      }
    } else {
      ctx.save(); ctx.fillStyle="rgba(232,240,247,0.05)"; ctx.font="11px system-ui"; ctx.fillText("…", px.x + 6, px.y + 12); ctx.restore();
    }
  }

  // NUEVO: overlay sin líneas; nombres/LEDs togglables
  function drawElectronicsOverlay(){
    if (!showElecEl.checked) return;
    const showLeds = showHwLedsEl.checked;
    const showLabels = showHwLabelsEl.checked;
    if (!showLeds && !showLabels) return;

    for (const c of sim.hw){
      const p = mm2px(c.posMM);

      let onCol = "rgba(74,222,128,0.85)";
      let offCol = "rgba(74,222,128,0.12)";
      if (c.kind === "servo"){ onCol="rgba(168,85,247,0.85)"; offCol="rgba(168,85,247,0.12)"; }
      if (c.kind === "sensor"){ onCol="rgba(59,130,246,0.85)"; offCol="rgba(59,130,246,0.12)"; }

      // si sólo querés LEDs (sin cajas), lo hacemos liviano
      if (showLeds && !showLabels){
        circle(p.x, p.y, 4.2, c.active ? onCol : offCol, "rgba(34,48,65,0.8)");
        continue;
      }

      // caja compacta + (opcional) LED + (opcional) label
      ctx.save();
      ctx.strokeStyle = "rgba(34,48,65,0.45)";
      ctx.fillStyle   = "rgba(11,16,23,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x-50, p.y-11, 100, 22, 7);
      else { ctx.rect(p.x-50, p.y-11, 100, 22); }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (showLeds){
        circle(p.x-40, p.y, 4.2, c.active ? onCol : offCol, "rgba(34,48,65,0.8)");
      }

      if (showLabels){
        ctx.save();
        ctx.fillStyle = "rgba(232,240,247,0.62)";
        ctx.font = "10.5px system-ui";
        const short = c.label.length > 22 ? (c.label.slice(0,22)+"…") : c.label;
        ctx.fillText(short, p.x-30, p.y+4);
        ctx.restore();
      }
    }
  }

  // ---------- Draw main ----------
  function draw(){
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.save(); ctx.fillStyle="#0b0f14"; ctx.fillRect(0,0,canvas.width, canvas.height); ctx.restore();

    if (viewEngineeringEl.checked){
      drawEngineeringGrid();
      drawEngineeringAxes();
      drawLayoutBoxes();
    }

    // conveyor line
    ctx.save();
    ctx.strokeStyle="#223041"; ctx.lineWidth=3;
    const cY = world.conveyorY*world.mmToPx;
    ctx.beginPath(); ctx.moveTo(50,cY); ctx.lineTo(canvas.width-50,cY); ctx.stroke();
    ctx.restore();
    drawLabel("Cinta/transportador (recurso único)", 56, cY-10);

    // nodes
    const col = mm2px(world.columnOut);
    circle(col.x,col.y,10,"#0f1723"); drawLabel("Salida columnas + válvula", col.x-55, col.y-18);

    const ww = mm2px(world.washWaste);
    circle(ww.x,ww.y,14,"rgba(251,113,133,0.10)"); drawLabel("Waste lavado", ww.x+18, ww.y+4);

    // racks
    if (sim.collector.rack) drawRack(sim.collector.rack);
    if (sim.pipA.rack && sim.pipA.rack !== sim.collector.rack) drawRack(sim.pipA.rack);

    const rq = mm2px(world.rackPipetteOrigin);
    drawLabel(`Cola racks: ${sim.rackQueue.length}`, rq.x-20, rq.y+90);

    // markers
    const res = mm2px(world.reservoir);
    circle(res.x,res.y,14,"rgba(148,163,184,0.10)");
    drawLabel("Reservorio", res.x-32, res.y-20);

    const wst = mm2px(world.waste);
    circle(wst.x,wst.y,13,"rgba(251,113,133,0.08)");
    drawLabel("Waste", wst.x-16, wst.y-18);

    const pm = mm2px(world.plateMag);
    circle(pm.x,pm.y,13,"rgba(232,240,247,0.06)");
    drawLabel("Mag. placas", pm.x-40, pm.y-18);

    const rm = mm2px(world.rackMag);
    circle(rm.x,rm.y,13,"rgba(232,240,247,0.06)");
    drawLabel("Mag. racks", rm.x-38, rm.y-18);

    const pb = mm2px(world.plateBufferPos);
    circle(pb.x,pb.y,14,"rgba(232,240,247,0.06)");
    drawLabel("Buffer placas", pb.x-45, pb.y-20);

    const ps = mm2px(world.plateStackPos);
    circle(ps.x,ps.y,14,"rgba(232,240,247,0.06)");
    drawLabel("Stack final", ps.x-40, ps.y-20);

    // plates
    if (sim.plateSt1) drawPlateAt(world.plateSt1, sim.plateSt1);
    if (sim.plateSt2) drawPlateAt(world.plateSt2, sim.plateSt2);

    if (sim.movingPlate){
      const t = sim.movingPlate.t;
      const p = { x: lerp(sim.movingPlate.from.x, sim.movingPlate.to.x, t),
                  y: lerp(sim.movingPlate.from.y, sim.movingPlate.to.y, t) };
      drawPlateAt(p, sim.movingPlate.plate);
    }

    // tip boxes
    const maxSmallDraw = Math.min(sim.smallBoxesTotal, world.smallBoxTLs.length);
    for (let b=0;b<maxSmallDraw;b++) drawTipBoxSmall(b, b===sim.smallBoxSlot);
    const maxLargeDraw = Math.min(sim.largeBoxesTotal, world.largeBoxTLs.length);
    for (let b=0;b<maxLargeDraw;b++) drawTipBoxLarge(b, b===sim.largeBoxSlot);

    // heads
    const hc = mm2px(sim.collectorHead);
    crosshair(hc.x,hc.y,10,"#e8f0f7"); circle(hc.x,hc.y,6,"rgba(232,240,247,0.08)","#e8f0f7");
    drawLabel("Colector", hc.x+12, hc.y-12);

    const ha = mm2px(sim.pipA);
    crosshair(ha.x,ha.y,9,"#fbbf24"); circle(ha.x,ha.y,6,"rgba(251,191,36,0.10)","#fbbf24");
    drawLabel(`Pip A (${sim.pipA.tipType})`, ha.x+12, ha.y-12);

    const hr = mm2px(sim.pipR);
    crosshair(hr.x,hr.y,9,"#4ade80"); circle(hr.x,hr.y,6,"rgba(74,222,128,0.10)","#4ade80");
    drawLabel(`Pip R (${sim.pipR.tipType})`, hr.x+12, hr.y-12);

    // drops visual
    if (sim.collector.state === "COLLECTING"){
      ctx.save(); ctx.fillStyle="rgba(232,240,247,0.35)";
      for (let i=0;i<6;i++){
        const tt=(sim.time*2+i)%1;
        const x=col.x + (hc.x-col.x)*0.12;
        const y=col.y + (hc.y-col.y)*(0.15+0.75*tt);
        ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    if (sim.collector.state === "WASH"){
      ctx.save(); ctx.fillStyle="rgba(251,113,133,0.35)";
      for (let i=0;i<6;i++){
        const tt=(sim.time*2+i)%1;
        const x=ww.x + 5;
        const y=ww.y - 20 + 40*tt;
        ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // top panel (auto width)
    const panelW = canvas.width - 28;
    ctx.save();
    ctx.fillStyle="rgba(15,23,35,0.85)";
    ctx.strokeStyle="#223041"; ctx.lineWidth=1;
    ctx.fillRect(14,14,panelW,64);
    ctx.strokeRect(14,14,panelW,64);
    ctx.fillStyle="#e8f0f7"; ctx.font="13px system-ui";
    ctx.fillText(`Modo: ${sim.mode} | Válvula: ${sim.valveChannel===0?"WASH":(sim.valveChannel+"/"+cfg.numColumns)} (servo ${sim.valveServoDeg}°) | Time-warp: ${timeScale.toFixed(2)}×`, 28, 38);
    ctx.fillStyle="#9fb0c0"; ctx.font="12px system-ui";
    ctx.fillText(`Colector: ${sim.collector.state} | Aliq: ${sim.pipA.sub} | Reag: ${sim.pipR.sub} | racksQ ${sim.rackQueue.length} | bufPl ${sim.plateBuffer.length} | stacked ${sim.stackedPlates}`, 28, 58);
    ctx.restore();

    // electronics overlay (sin líneas)
    drawElectronicsOverlay();
  }

  // ---------- UI sync ----------
  function syncUI(){
    vState.textContent = sim.mode;
    vValve.textContent = sim.valveChannel===0 ? `WASH (${sim.valveServoDeg}°)` : `${sim.valveChannel}/${cfg.numColumns} (${sim.valveServoDeg}°)`;
    vCollector.textContent = sim.collector.state;
    vAliquot.textContent = sim.pipA.sub + (sim.pipA.rack ? ` (rack ${sim.pipA.rack.id})` : "");
    vReagent.textContent = sim.pipR.sub + (sim.plateSt2 ? ` (plate ${sim.plateSt2.id})` : "");
    vQueues.textContent = `${sim.rackQueue.length} / ${sim.plateBuffer.length}`;
    vPlates.textContent = `ST1:${sim.plateSt1?sim.plateSt1.id:"-"} / ST2:${sim.plateSt2?sim.plateSt2.id:"-"} / Stack:${sim.stackedPlates}`;
    vMag.textContent = `${sim.plateSupply} / ${sim.rackSupply}`;

    vBoxes.textContent = `SMALL ${Math.min(sim.smallBoxSlot+1, Math.max(0,sim.smallBoxesTotal))}/${Math.max(0,sim.smallBoxesTotal)} · LARGE ${Math.min(sim.largeBoxSlot+1, Math.max(0,sim.largeBoxesTotal))}/${Math.max(0,sim.largeBoxesTotal)}`;
    vTips.textContent = `SMALL ${tipsRemaining(sim.tipsSmallUsed)} · LARGE ${tipsRemaining(sim.tipsLargeUsed)}`;
    vWaste.textContent = `Res ${Math.round(sim.reservoir_uL)} µL · tips ${sim.wasteTipCount} · liq ${Math.round(sim.wasteLiquid_uL)} µL`;

    if (sim.alarm) vAlarm.innerHTML = `<span class="status-bad">● ${sim.alarm.code}</span>`;
    else vAlarm.innerHTML = `<span class="status-ok">● OK</span>`;

    vTimeScale.textContent = `${timeScale.toFixed(2)}×`;

    // hardware list (si querés, esto también lo podemos esconder con otro checkbox)
    hwListEl.innerHTML = "";
    for (const c of sim.hw){
      const dotCol = c.active
        ? (c.kind==="servo" ? "rgba(168,85,247,0.95)" : (c.kind==="sensor" ? "rgba(59,130,246,0.95)" : "rgba(74,222,128,0.95)"))
        : (c.kind==="servo" ? "rgba(168,85,247,0.18)" : (c.kind==="sensor" ? "rgba(59,130,246,0.18)" : "rgba(74,222,128,0.18)"));

      const row = document.createElement("div");
      row.className = "hwrow";
      row.innerHTML = `
        <div class="hwname"><span class="dot" style="background:${dotCol}"></span>${c.label}</div>
        <div class="hwst">${c.active ? "<span class='status-ok'>ON</span>" : "<span class='muted'>OFF</span>"}</div>
      `;
      hwListEl.appendChild(row);
    }
  }

  // --- NEW --- Dashboard + run report UI
  function formatEta(seconds){
    if (!isFinite(seconds) || seconds < 0) return "--";
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function updateDashboard(){
    const Q = cfg.drop_uL * cfg.dropRate_hz;
    const tFrac = Q > 0 ? (cfg.target_uL / Q) : Infinity;
    const throughput = (tFrac > 0 && isFinite(tFrac)) ? (3600 / tFrac) : 0;
    const totalFractions = cfg.numColumns * cfg.N * cfg.M;
    const doneFractions = sim.runReport.length;
    const remainingFractions = Math.max(0, totalFractions - doneFractions);
    const etaSec = (throughput > 0) ? (remainingFractions / throughput) * 3600 : Infinity;

    dashThroughput.textContent = `${throughput.toFixed(1)} fracc/h`;
    dashEta.textContent = `ETA: ${formatEta(etaSec)} (${doneFractions}/${totalFractions})`;

    const tipsSmallUsed = sim.smallBoxSlot * 96 + (96 - tipsRemaining(sim.tipsSmallUsed));
    const tipsSmallTotal = sim.smallBoxesTotal * 96;
    const tipsLargeUsed = sim.largeBoxSlot * 24 + (24 - tipsRemaining(sim.tipsLargeUsed));
    const tipsLargeTotal = sim.largeBoxesTotal * 24;
    const tipsSmallRemaining = Math.max(0, tipsSmallTotal - tipsSmallUsed);
    const tipsLargeRemaining = Math.max(0, tipsLargeTotal - tipsLargeUsed);

    const platesUsed = Math.max(0, cfg.plateSupply - sim.plateSupply);
    const racksUsed = Math.max(0, cfg.rackSupply - sim.rackSupply);

    dashConsumables.textContent = `Tips S/L usados: ${tipsSmallUsed}/${tipsLargeUsed}`;
    dashTips.textContent = `Tips S/L rem: ${tipsSmallRemaining}/${tipsLargeRemaining}`;
    dashPlates.textContent = `Placas usadas ${platesUsed} · Racks usados ${racksUsed}`;
    dashWaste.textContent = `Tips ${sim.wasteTipCount}/${cfg.wasteTipCap} · Liq ${Math.round(sim.wasteLiquid_uL)}/${cfg.wasteLiqCap_uL} µL`;

    const wasteRatio = Math.max(sim.wasteTipCount / cfg.wasteTipCap, sim.wasteLiquid_uL / cfg.wasteLiqCap_uL);
    const reservoirRatio = cfg.reagentReservoirStart_uL > 0 ? (sim.reservoir_uL / cfg.reagentReservoirStart_uL) : 0;
    const tipsRatio = Math.min(
      tipsSmallTotal ? (tipsSmallRemaining / tipsSmallTotal) : 1,
      tipsLargeTotal ? (tipsLargeRemaining / tipsLargeTotal) : 1
    );

    const riskBadge = (label, level) => {
      const col = level === "ALARM" ? "#fb7185" : level === "WARN" ? "#fbbf24" : "#4ade80";
      return `<span class="risk-pill"><span class="risk-dot" style="background:${col}"></span>${label}:${level}</span>`;
    };

    const riskWaste = wasteRatio > 0.95 ? "ALARM" : (wasteRatio > 0.8 ? "WARN" : "OK");
    const riskRes = reservoirRatio < 0.15 ? "ALARM" : (reservoirRatio < 0.35 ? "WARN" : "OK");
    const riskTips = tipsRatio < 0.1 ? "ALARM" : (tipsRatio < 0.25 ? "WARN" : "OK");

    dashRisk.innerHTML = [
      riskBadge("Waste", riskWaste),
      riskBadge("Res", riskRes),
      riskBadge("Tips", riskTips)
    ].join(" ");
  }

  function updateRunReportButtons(){
    const done = sim.mode === "DONE";
    el("btnExportRunCsv").disabled = !done;
    el("btnExportRunJson").disabled = !done;
  }

  // ---------- Control ----------
  // --- NEW --- Run report export helpers
  function downloadText(filename, text){
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportRunReportJson(){
    const payload = {
      timestamp: new Date().toISOString(),
      runReport: sim.runReport
    };
    downloadText("run_report.json", JSON.stringify(payload, null, 2));
  }

  function exportRunReportCsv(){
    const header = ["columnIdx","fracIndex","tubeIndex","timestamp_sim","volumen_uL","rackId"];
    const lines = [header.join(",")];
    for (const row of sim.runReport){
      lines.push([
        row.columnIdx,
        row.fracIndex,
        row.tubeIndex,
        row.timestamp_sim.toFixed(3),
        row.volumen_uL,
        row.rackId
      ].join(","));
    }
    downloadText("run_report.csv", lines.join("\n"));
  }

  function resetAll(){
    sim.mode="IDLE";
    sim.time=0;
    sim.alarm=null;
    sim.runReport = [];

    sim.plateSupply = cfg.plateSupply;
    sim.rackSupply = cfg.rackSupply;
    sim.reservoir_uL = cfg.reagentReservoirStart_uL;
    sim.wasteTipCount = 0;
    sim.wasteLiquid_uL = 0;

    sim.smallBoxesTotal = cfg.smallBoxes;
    sim.largeBoxesTotal = cfg.largeBoxes;
    sim.smallBoxSlot = 0;
    sim.largeBoxSlot = 0;
    sim.tipsSmallUsed = new Array(96).fill(false);
    sim.tipsLargeUsed = new Array(24).fill(false);

    sim.rackQueue = [];
    sim.plateBuffer = [];
    sim.stackedPlates = 0;

    sim.plateSt1 = null;
    sim.plateSt2 = null;
    sim.movingPlate = null;

    ids = { rack: 1, plate: 1 };

    updateValve(1);
    sim.valveActiveT = 0;

    sim.collectorHead.x = world.collectorHome.x; sim.collectorHead.y = world.collectorHome.y;
    sim.collectorHead.tx = world.collectorHome.x; sim.collectorHead.ty = world.collectorHome.y;

    sim.pipA.x = world.pipAHome.x; sim.pipA.y = world.pipAHome.y;
    sim.pipA.tx = world.pipAHome.x; sim.pipA.ty = world.pipAHome.y;
    sim.pipA.hasTip=false; sim.pipA.tipType="NONE"; sim.pipA.volInTip=0; sim.pipA.phaseT=0; sim.pipA.sub="WAIT_RACK"; sim.pipA.w=0; sim.pipA.rack=null; sim.pipA._tipIdx=-1;

    sim.pipR.x = world.pipRHome.x; sim.pipR.y = world.pipRHome.y;
    sim.pipR.tx = world.pipRHome.x; sim.pipR.ty = world.pipRHome.y;
    sim.pipR.hasTip=false; sim.pipR.tipType="NONE"; sim.pipR.volInTip=0; sim.pipR.phaseT=0; sim.pipR.sub="WAIT_PLATE"; sim.pipR.w=0; sim.pipR.tipIdx=-1;

    sim.collector.state = "WAIT_START";
    sim.collector.currentColumnIdx = 0;
    sim.collector.rack = null;
    sim.collector.washed_uL = 0;

    sim.hw = [];
    log("Reset completo.");
  }

  function applyConfig(){
    cfg.numColumns = clamp(parseInt(el("numCols").value,10)||1, 1, 12);
    cfg.wash_uL = Math.max(0, parseFloat(el("washUL").value)||0);

    cfg.N = clamp(parseInt(el("gridN").value,10)||1, 1, 20);
    cfg.M = clamp(parseInt(el("gridM").value,10)||1, 1, 20);

    cfg.target_uL = Math.max(1, parseFloat(el("targetUL").value)||1);
    cfg.drop_uL = Math.max(0.1, parseFloat(el("dropUL").value)||0.1);
    cfg.dropRate_hz = Math.max(0, parseFloat(el("dropRate").value)||0);

    cfg.speedCollector = Math.max(1, parseFloat(el("speedXY").value)||1);
    cfg.speedPipA = Math.max(1, parseFloat(el("speedPipA").value)||1);
    cfg.speedPipR = Math.max(1, parseFloat(el("speedPipR").value)||1);

    cfg.pipetteCapR_uL = Math.max(50, parseFloat(el("pipCapR").value)||50);
    cfg.aliquot_uL = Math.max(1, parseFloat(el("aliquotUL").value)||1);
    cfg.reagent_uL = Math.max(1, parseFloat(el("reagentUL").value)||1);

    cfg.plateBufferCap = Math.max(0, parseInt(el("plateBufferCap").value,10)||0);
    cfg.plateSupply = Math.max(0, parseInt(el("plateSupply").value,10)||0);
    cfg.plateStackCap = Math.max(1, parseInt(el("plateStackCap").value,10)||1);
    cfg.rackSupply = Math.max(0, parseInt(el("rackSupply").value,10)||0);

    cfg.reagentReservoirStart_uL = Math.max(0, parseFloat(el("resStart").value)||0);
    cfg.smallBoxes = Math.max(0, parseInt(el("smallBoxes").value,10)||0);
    cfg.largeBoxes = Math.max(0, parseInt(el("largeBoxes").value,10)||0);

    cfg.wasteTipCap = Math.max(1, parseInt(el("wasteTipCap").value,10)||1);
    cfg.wasteLiqCap_uL = Math.max(1, parseFloat(el("wasteLiqCap").value)||1);

    resetAll();
    log("Config aplicada.");
  }

  function start(){
    if (sim.mode === "ERROR") { log("Hay una alarma. Reset para continuar.", "status-warn"); return; }
    if (sim.mode === "DONE") resetAll();
    sim.mode = "RUNNING";
    log("RUN iniciado.");
  }

  function pauseToggle(){
    if (sim.mode === "RUNNING") { sim.mode = "IDLE"; log("Pausa (IDLE)."); }
    else if (sim.mode === "IDLE") { sim.mode = "RUNNING"; log("Reanudado."); }
  }

  // ---------- Time scale ----------
  let timeScale = 1.0;
  timeScaleEl.addEventListener("input", () => {
    timeScale = parseFloat(timeScaleEl.value);
    vTimeScale.textContent = `${timeScale.toFixed(2)}×`;
  });


  // ---------- Pop-ups (single archivo; funciona con doble click) ----------
  let popCfg = null;
  let popHW = null;
  let popLog = null;
  let popLayout = null;

  function popupBlocked(){
    alert("El navegador bloqueó la ventana emergente.\n\nTip: habilitá pop-ups para este archivo (file://) y reintentá usando el botón.");
  }

  const CFG_IDS = [
    "numCols","washUL","gridN","gridM","targetUL","dropUL","dropRate","speedXY",
    "speedPipA","speedPipR","pipCapR","aliquotUL","reagentUL","plateBufferCap","plateSupply",
    "plateStackCap","rackSupply","smallBoxes","largeBoxes","wasteTipCap","wasteLiqCap","resStart"
  ];

  function readFieldsFromMain(){
    const fields = {};
    for (const id of CFG_IDS){
      const e = el(id);
      if (!e) continue;
      fields[id] = e.value;
    }
    return fields;
  }

  function writeFieldsToMain(fields){
    if (!fields) return;
    for (const [id,val] of Object.entries(fields)){
      const e = el(id);
      if (!e) continue;
      e.value = String(val);
    }
  }

  function viewSnapshot(){
    return {
      timeScale: parseFloat(timeScaleEl.value),
      showElec: !!showElecEl.checked,
      showHwLeds: !!showHwLedsEl.checked,
      showHwLabels: !!showHwLabelsEl.checked,
      viewEngineering: !!viewEngineeringEl.checked
    };
  }

  function safePost(win, msg){
    if (!win || win.closed) return;
    try { win.postMessage(msg, "*"); } catch(_e) {}
  }

  function pushCfgViewSnapshot(){
    safePost(popCfg, { __vt:1, type:"CFG_VIEW_SNAPSHOT", payload: { fields: readFieldsFromMain(), view: viewSnapshot() } });
  }

  let _lastHwPush = 0;
  function pushHWSnapshot(force=false){
    const t = performance.now();
    if (!force && (t - _lastHwPush) < 120) return;
    _lastHwPush = t;

    safePost(popHW, { __vt:1, type:"HW_SNAPSHOT", payload: {
      mode: sim.mode,
      alarm: sim.alarm,
      hw: sim.hw,
      valveChannel: sim.valveChannel,
      valveServoDeg: sim.valveServoDeg,
      reservoir_uL: sim.reservoir_uL,
      wasteTipCount: sim.wasteTipCount,
      wasteLiquid_uL: sim.wasteLiquid_uL
    }});
  }


  // Snapshot de consola (logs)
  let _lastLogPush = 0;
  function pushLogSnapshot(force=false){
    const t = performance.now();
    if (!force && (t - _lastLogPush) < 180) return;
    _lastLogPush = t;
    if (!logEl) return;
    safePost(popLog, { __vt:1, type:"LOG_SNAPSHOT", payload: { html: logEl.innerHTML }});
  }

  // --- NEW --- Snapshot layout/I-O
  function pushLayoutSnapshot(force=false){
    safePost(popLayout, { __vt:1, type:"LAYOUT_SNAPSHOT", payload: {
      layout,
      ioMap,
      world,
      viewEngineering: !!viewEngineeringEl.checked
    }});
  }

  function buildCfgPopupHTML(){
    // Evitar la secuencia literal de cierre de script dentro de este archivo.
    const closeScript = "</scr" + "ipt>";
    const openScript  = "<scr" + "ipt>";

    return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Virtual Twin – Parámetros</title>
<style>
  :root { --bg:#0b0f14; --panel:#121a24; --muted:#9fb0c0; --text:#e8f0f7; --ok:#4ade80; --warn:#fbbf24; --bad:#fb7185; }
  body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial; background:var(--bg); color:var(--text); }
  header{ padding:12px 14px; border-bottom:1px solid #1f2a37; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  header h1{ font-size:14px; margin:0; font-weight:650; }
  .pill{ font-size:12px; color:var(--muted); border:1px solid #243244; padding:4px 8px; border-radius:999px; }
  .wrap{ padding:12px; }
  .card{ background:var(--panel); border:1px solid #1f2a37; border-radius:14px; overflow:hidden; }
  .card h2{ font-size:12px; margin:0; padding:10px 12px; border-bottom:1px solid #1f2a37; color:var(--muted); font-weight:650; }
  .card .content{ padding:12px; }
  .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  button{ border:1px solid #243244; background:#0b1017; color:var(--text); padding:8px 10px; border-radius:10px; cursor:pointer; }
  button:hover{ border-color:#3a4c66; }
  button.primary{ background:#132034; border-color:#35507a; }
  button.danger{ border-color:#5b2533; background:#1a0f13; }
  label{ display:block; font-size:12px; color:var(--muted); margin-bottom:6px; }
  input{ width:100%; padding:8px 10px; border-radius:10px; border:1px solid #253244; background:#0b1017; color:var(--text); }
  input[type="range"]{ width:100%; }
  .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .item{ border:1px solid #1f2a37; border-radius:12px; padding:10px; background:#0b1017; }
  .k{ font-size:11px; color:var(--muted); }
  .v{ font-size:14px; margin-top:4px; font-variant-numeric: tabular-nums; }
  .toggles{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin: 8px 0 10px; }
  .t{ display:flex; gap:8px; align-items:center; font-size:12px; color:var(--muted); }
  .t input{ width:auto; }
  .small{ font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<header>
  <h1>Parámetros de entrada</h1>
  <span class="pill">Ventana emergente</span>
  <span class="pill" id="conn">● sin conectar</span>
</header>

<div class="wrap">
  <section class="card">
    <h2>Acciones</h2>
    <div class="content">
      <div class="row" style="margin-bottom:10px">
        <button id="apply" class="primary">Aplicar config (resetea)</button>
        <button id="refresh">Sincronizar desde main</button>
        <button id="close" class="danger">Cerrar</button>
      </div>

      <div class="item" style="margin-bottom:10px;">
        <div class="k">Velocidad de tiempo (Time-warp)</div>
        <div class="row">
          <input id="timeScale" type="range" min="0.25" max="25" step="0.25" value="1" />
          <div class="v" id="vTimeScale" style="min-width:72px;text-align:right;">1.00×</div>
        </div>
        <div class="small">Afecta dt de simulación (motores, gotas, aspirar/dispensar, transporte).</div>
      </div>

      <div class="toggles">
        <div class="t"><input id="showElec" type="checkbox" checked><span>Overlay electrónica</span></div>
        <div class="t"><input id="showHwLeds" type="checkbox" checked><span>Luces (LEDs)</span></div>
        <div class="t"><input id="showHwLabels" type="checkbox" checked><span>Nombres</span></div>
      </div>

      <div class="grid" id="grid">
        ${CFG_IDS.map(id => `
          <div>
            <label>${id}</label>
            <input id="${id}" />
          </div>`).join("")}
      </div>

      <div class="small" style="margin-top:10px">
        Tip: al aplicar config se resetea el estado (volúmenes, racks, placas, etc.) para que arranque con los nuevos parámetros.
      </div>
    </div>
  </section>
</div>

${openScript}
(() => {
  const send = (type, payload) => {
    try { window.opener && window.opener.postMessage({__vt:1, type, payload}, "*"); }
    catch(_e){}
  };

  const CFG_IDS = ["numCols","washUL","gridN","gridM","targetUL","dropUL","dropRate","speedXY","speedPipA","speedPipR","pipCapR","aliquotUL","reagentUL","plateBufferCap","plateSupply","plateStackCap","rackSupply","smallBoxes","largeBoxes","wasteTipCap","wasteLiqCap","resStart"];

  function fill({fields, view}){
    if (fields){
      for (const id of CFG_IDS){
        const e = document.getElementById(id);
        if (e && (id in fields)) e.value = fields[id];
      }
    }
    if (view){
      const ts = document.getElementById("timeScale");
      if (ts && typeof view.timeScale === "number") ts.value = String(view.timeScale);
      const vts = document.getElementById("vTimeScale");
      if (vts) vts.textContent = (parseFloat(ts.value)||1).toFixed(2)+"×";

      const se = document.getElementById("showElec");
      const sl = document.getElementById("showHwLeds");
      const sn = document.getElementById("showHwLabels");
      if (se) se.checked = !!view.showElec;
      if (sl) sl.checked = !!view.showHwLeds;
      if (sn) sn.checked = !!view.showHwLabels;
    }
  }

  function gather(){
    const fields = {};
    for (const id of CFG_IDS){
      const e = document.getElementById(id);
      if (e) fields[id] = e.value;
    }
    return fields;
  }

  // Human labels (replace the technical IDs)
  const labels = {
    numCols: "Columnas a analizar",
    washUL: "Lavado entre columnas (µL)",
    gridN: "Grilla tubos N (filas)",
    gridM: "Grilla tubos M (columnas)",
    targetUL: "Volumen fracción (µL)",
    dropUL: "Volumen gota (µL)",
    dropRate: "Tasa gotas (gotas/s)",
    speedXY: "Vel. XY colector (mm/s)",
    speedPipA: "Vel. XY pipeta alícuotas (mm/s)",
    speedPipR: "Vel. XY pipeta reactivo (mm/s)",
    pipCapR: "Capacidad pipeta reactivo (µL)",
    aliquotUL: "Alícuota a placa (µL)",
    reagentUL: "Reactivo a placa (µL)",
    plateBufferCap: "Buffer placas (capacidad)",
    plateSupply: "Placas en magazine",
    plateStackCap: "Capacidad stack final placas",
    rackSupply: "Racks Falcon en magazine",
    smallBoxes: "Cajas tips SMALL (96 tips/caja)",
    largeBoxes: "Cajas tips LARGE (24 tips/caja)",
    wasteTipCap: "Capacidad descarte tips (unid)",
    wasteLiqCap: "Capacidad descarte líquido (µL)",
    resStart: "Reservorio reactivo inicial (µL)"
  };

  for (const id of CFG_IDS){
    const lab = document.querySelector('label[for="'+id+'"]');
    const e = document.getElementById(id);
    if (e){
      const parent = e.closest("div");
      const l = parent ? parent.querySelector("label") : null;
      if (l && labels[id]) l.textContent = labels[id];
      if (e.type !== "number") e.type = "number";
      if (id === "dropUL") e.step = "0.1";
      if (id === "dropRate") e.step = "0.1";
    }
  }

  // buttons
  document.getElementById("apply").addEventListener("click", () => {
    send("APPLY_FIELDS", { fields: gather() });
  });
  document.getElementById("refresh").addEventListener("click", () => send("REQ_CFG_VIEW", {}));
  document.getElementById("close").addEventListener("click", () => window.close());

  // view controls
  const ts = document.getElementById("timeScale");
  const vts = document.getElementById("vTimeScale");
  ts.addEventListener("input", () => {
    const v = parseFloat(ts.value)||1;
    vts.textContent = v.toFixed(2)+"×";
    send("SET_VIEW", { timeScale: v });
  });

  for (const id of ["showElec","showHwLeds","showHwLabels"]){
    document.getElementById(id).addEventListener("change", () => {
      send("SET_VIEW", {
        showElec: document.getElementById("showElec").checked,
        showHwLeds: document.getElementById("showHwLeds").checked,
        showHwLabels: document.getElementById("showHwLabels").checked
      });
    });
  }

  // receive snapshot
  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || m.__vt !== 1) return;
    if (m.type === "CFG_VIEW_SNAPSHOT") fill(m.payload || {});
  });

  // initial handshake
  const conn = document.getElementById("conn");
  if (window.opener){
    conn.textContent = "● conectado";
    conn.style.borderColor = "#35507a";
  }
  send("REQ_CFG_VIEW", {});
})();
${closeScript}
</body></html>`;
  }

  function buildHWPopupHTML(){
    const closeScript = "</scr" + "ipt>";
    const openScript  = "<scr" + "ipt>";

    return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Virtual Twin – Electrónica</title>
<style>
  :root { --bg:#0b0f14; --panel:#121a24; --muted:#9fb0c0; --text:#e8f0f7; --ok:#4ade80; --warn:#fbbf24; --bad:#fb7185; }
  body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial; background:var(--bg); color:var(--text); }
  header{ padding:12px 14px; border-bottom:1px solid #1f2a37; display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between;}
  header h1{ font-size:14px; margin:0; font-weight:650; }
  .pill{ font-size:12px; color:var(--muted); border:1px solid #243244; padding:4px 8px; border-radius:999px; }
  .wrap{ padding:12px; }
  .card{ background:var(--panel); border:1px solid #1f2a37; border-radius:14px; overflow:hidden; }
  .card h2{ font-size:12px; margin:0; padding:10px 12px; border-bottom:1px solid #1f2a37; color:var(--muted); font-weight:650; }
  .card .content{ padding:12px; }
  button{ border:1px solid #243244; background:#0b1017; color:var(--text); padding:8px 10px; border-radius:10px; cursor:pointer; }
  button:hover{ border-color:#3a4c66; }
  button.danger{ border-color:#5b2533; background:#1a0f13; }
  .kv{ display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px; }
  .kv .item { border:1px solid #1f2a37; border-radius: 12px; padding: 10px; background:#0b1017; }
  .kv .k { font-size: 11px; color: var(--muted); }
  .kv .v { font-size: 14px; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .hwlist { height: 520px; overflow:auto; background:#0b1017; border:1px solid #1f2a37; border-radius: 12px; padding: 10px; }
  .hwrow { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 4px 0; border-bottom: 1px dashed rgba(31,42,55,0.7); }
  .hwrow:last-child{ border-bottom:none; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:8px; }
  .hwname { display:flex; align-items:center; font-size:12px; color:#cfe1f3; }
  .hwst { font-size:12px; color: var(--muted); }
  .status-ok { color: var(--ok); }
  .status-bad { color: var(--bad); }
  .muted { color:#8aa0b5; }
</style>
</head>
<body>
<header>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
    <h1>Estado de electrónica</h1>
    <span class="pill" id="mode">modo: -</span>
    <span class="pill" id="alarm">● OK</span>
  </div>
  <div style="display:flex;gap:10px;align-items:center;">
    <button id="refresh">Sincronizar</button>
    <button id="close" class="danger">Cerrar</button>
  </div>
</header>

<div class="wrap">
  <section class="card">
    <h2>Resumen</h2>
    <div class="content">
      <div class="kv">
        <div class="item"><div class="k">Válvula</div><div class="v" id="valve">-</div></div>
        <div class="item"><div class="k">Reservorio / descarte</div><div class="v" id="waste">-</div></div>
      </div>
      <div class="hwlist" id="hwList"></div>
    </div>
  </section>
</div>

${openScript}
(() => {
  const hwListEl = document.getElementById("hwList");
  const modeEl = document.getElementById("mode");
  const alarmEl = document.getElementById("alarm");
  const valveEl = document.getElementById("valve");
  const wasteEl = document.getElementById("waste");

  const send = (type, payload) => {
    try { window.opener && window.opener.postMessage({__vt:1, type, payload}, "*"); } catch(_e){}
  };

  function setText(el, txt){ if (el) el.textContent = txt; }

  function render(payload){
    if (!payload) return;

    setText(modeEl, "modo: " + (payload.mode || "-"));
    if (payload.alarm){
      alarmEl.textContent = "● " + payload.alarm.code;
      alarmEl.style.borderColor = "#5b2533";
      alarmEl.style.color = "#fb7185";
    } else {
      alarmEl.textContent = "● OK";
      alarmEl.style.borderColor = "#243244";
      alarmEl.style.color = "#4ade80";
    }

    const vc = payload.valveChannel;
    const vd = payload.valveServoDeg;
    valveEl.textContent = (vc===0 ? ("WASH ("+vd+"°)") : (vc + " ("+vd+"°)"));

    wasteEl.textContent = "Res " + Math.round(payload.reservoir_uL||0) + " µL · tips " + (payload.wasteTipCount||0) +
                          " · liq " + Math.round(payload.wasteLiquid_uL||0) + " µL";

    const hw = payload.hw || [];
    hwListEl.innerHTML = "";
    for (const c of hw){
      const active = !!c.active;
      let colOn = "rgba(74,222,128,0.95)";
      let colOff = "rgba(74,222,128,0.18)";
      if (c.kind === "servo"){ colOn="rgba(168,85,247,0.95)"; colOff="rgba(168,85,247,0.18)"; }
      if (c.kind === "sensor"){ colOn="rgba(59,130,246,0.95)"; colOff="rgba(59,130,246,0.18)"; }
      const dotCol = active ? colOn : colOff;

      const row = document.createElement("div");
      row.className = "hwrow";
      row.innerHTML = \`
        <div class="hwname"><span class="dot" style="background:\${dotCol}"></span>\${c.label}</div>
        <div class="hwst">\${active ? "<span class='status-ok'>ON</span>" : "<span class='muted'>OFF</span>"}</div>\`;
      hwListEl.appendChild(row);
    }
  }

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || m.__vt !== 1) return;
    if (m.type === "HW_SNAPSHOT") render(m.payload);
  });

  document.getElementById("refresh").addEventListener("click", () => send("REQ_HW", {}));
  document.getElementById("close").addEventListener("click", () => window.close());

  send("REQ_HW", {});
})();
${closeScript}
</body></html>`;
  }


  function buildLogPopupHTML(){
    const closeScript = "</scr" + "ipt>";
    const openScript  = "<scr" + "ipt>";

    return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Virtual Twin – Consola</title>
<style>
  :root { --bg:#0b0f14; --panel:#121a24; --muted:#9fb0c0; --text:#e8f0f7; --ok:#4ade80; --warn:#fbbf24; --bad:#fb7185; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial;
         background: var(--bg); color: var(--text); }
  header { padding: 12px 14px; border-bottom: 1px solid #1f2a37; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size: 14px; margin:0; font-weight: 700; }
  .pill { font-size:12px; color: var(--muted); border:1px solid #243244; padding: 4px 8px; border-radius: 999px; }
  button { border:1px solid #243244; background:#0b1017; color: var(--text); padding: 7px 10px; border-radius: 10px; cursor:pointer; }
  button:hover { border-color:#3a4c66; }
  button.danger { border-color:#5b2533; background:#1a0f13; }
  .wrap { padding: 12px; }
  .log { height: calc(100vh - 86px); overflow:auto; background:#0b1017; border:1px solid #1f2a37; border-radius: 12px; padding: 10px;
         font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New"; font-size: 11px; color:#cfe1f3; }
  .log .muted { color:#8aa0b5; }
  .status-ok { color: var(--ok); }
  .status-warn { color: var(--warn); }
  .status-bad { color: var(--bad); }
</style>
</head>
<body>
<header>
  <h1>Consola</h1>
  <span class="pill" id="count">0 líneas</span>
  <button id="refresh">Sincronizar</button>
  <button id="clear" class="danger">Limpiar vista</button>
  <button id="close" class="danger">Cerrar</button>
</header>
<div class="wrap">
  <div class="log" id="logBox"></div>
</div>

${openScript}
(() => {
  const logBox = document.getElementById("logBox");
  const countEl = document.getElementById("count");

  const send = (type, payload) => {
    try { window.opener && window.opener.postMessage({__vt:1, type, payload}, "*"); } catch(_e){}
  };

  function render(payload){
    if (!payload) return;
    const html = payload.html || "";
    logBox.innerHTML = html;
    const lines = (html.match(/<div/gi) || []).length;
    countEl.textContent = lines + " líneas";
  }

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || m.__vt !== 1) return;
    if (m.type === "LOG_SNAPSHOT") render(m.payload);
  });

  document.getElementById("refresh").addEventListener("click", () => send("REQ_LOG", {}));
  document.getElementById("clear").addEventListener("click", () => { logBox.innerHTML = ""; countEl.textContent = "0 líneas"; });
  document.getElementById("close").addEventListener("click", () => window.close());

  send("REQ_LOG", {});
})();
${closeScript}
</body></html>`;
  }

  // --- NEW --- Layout/I-O popup
  function buildLayoutPopupHTML(){
    const closeScript = "</scr" + "ipt>";
    const openScript  = "<scr" + "ipt>";

    return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Virtual Twin – Layout/I-O</title>
<style>
  :root { --bg:#0b0f14; --panel:#121a24; --muted:#9fb0c0; --text:#e8f0f7; --ok:#4ade80; --warn:#fbbf24; --bad:#fb7185; }
  body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial; background:var(--bg); color:var(--text); }
  header{ padding:12px 14px; border-bottom:1px solid #1f2a37; display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between;}
  header h1{ font-size:14px; margin:0; font-weight:650; }
  .pill{ font-size:12px; color:var(--muted); border:1px solid #243244; padding:4px 8px; border-radius:999px; }
  .wrap{ padding:12px; display:grid; gap:12px; }
  .card{ background:var(--panel); border:1px solid #1f2a37; border-radius:14px; overflow:hidden; }
  .card h2{ font-size:12px; margin:0; padding:10px 12px; border-bottom:1px solid #1f2a37; color:var(--muted); font-weight:650; }
  .card .content{ padding:12px; }
  button{ border:1px solid #243244; background:#0b1017; color:var(--text); padding:8px 10px; border-radius:10px; cursor:pointer; }
  button:hover{ border-color:#3a4c66; }
  button.primary{ background:#132034; border-color:#35507a; }
  button.danger{ border-color:#5b2533; background:#1a0f13; }
  table{ width:100%; border-collapse:collapse; font-size:12px; }
  th, td{ border-bottom:1px solid #1f2a37; padding:6px 6px; text-align:left; }
  th{ color:var(--muted); font-weight:600; position:sticky; top:0; background:#121a24; }
  input, select{ width:100%; padding:6px 8px; border-radius:8px; border:1px solid #253244; background:#0b1017; color:var(--text); font-size:12px; }
  .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .scroll{ max-height:280px; overflow:auto; border:1px solid #1f2a37; border-radius:12px; }
  .small{ font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<header>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
    <h1>Layout / I-O map</h1>
    <span class="pill" id="engState">Engineering: OFF</span>
  </div>
  <div class="row">
    <button id="apply" class="primary">Apply layout</button>
    <button id="refresh">Refresh</button>
    <button id="export">Export deck.json</button>
    <button id="close" class="danger">Cerrar</button>
  </div>
</header>

<div class="wrap">
  <section class="card">
    <h2>Layout de módulos</h2>
    <div class="content">
      <div class="row" style="margin-bottom:8px;">
        <label class="small"><input id="toggleEngineering" type="checkbox" /> Engineering ON</label>
        <span class="small">Editar coordenadas/tamaños en mm.</span>
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>name</th><th>x_mm</th><th>y_mm</th><th>w_mm</th><th>h_mm</th><th>z_mm</th><th>notes</th>
            </tr>
          </thead>
          <tbody id="layoutBody"></tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>I/O map</h2>
    <div class="content">
      <div class="row" style="margin-bottom:8px;">
        <select id="filterKind">
          <option value="">Kind: ALL</option>
          <option value="SENSOR">SENSOR</option>
          <option value="ACTUATOR">ACTUATOR</option>
        </select>
        <select id="filterCrit">
          <option value="">Criticality: ALL</option>
          <option value="LOW">LOW</option>
          <option value="MED">MED</option>
          <option value="HIGH">HIGH</option>
        </select>
        <input id="filterSearch" placeholder="Buscar..." />
      </div>
      <div class="scroll" style="max-height:260px;">
        <table>
          <thead>
            <tr>
              <th>id</th><th>label</th><th>kind</th><th>signal</th><th>endpoint</th><th>update_hz</th><th>latency_ms</th><th>criticality</th><th>notes</th>
            </tr>
          </thead>
          <tbody id="ioBody"></tbody>
        </table>
      </div>
    </div>
  </section>
</div>

${openScript}
(() => {
  let snapshot = null;
  const layoutBody = document.getElementById("layoutBody");
  const ioBody = document.getElementById("ioBody");
  const engState = document.getElementById("engState");
  const toggleEngineering = document.getElementById("toggleEngineering");

  const send = (type, payload) => {
    try { window.opener && window.opener.postMessage({__vt:1, type, payload}, "*"); } catch(_e){}
  };

  function renderLayout(modules){
    layoutBody.innerHTML = "";
    for (const mod of modules){
      const tr = document.createElement("tr");
      tr.dataset.id = mod.id;
      tr.innerHTML = \`
        <td><input data-field="name" value="\${mod.name}" /></td>
        <td><input data-field="x_mm" type="number" value="\${mod.x_mm}" /></td>
        <td><input data-field="y_mm" type="number" value="\${mod.y_mm}" /></td>
        <td><input data-field="w_mm" type="number" value="\${mod.w_mm}" /></td>
        <td><input data-field="h_mm" type="number" value="\${mod.h_mm}" /></td>
        <td><input data-field="z_mm" type="number" value="\${mod.z_mm ?? ""}" /></td>
        <td><input data-field="notes" value="\${mod.notes || ""}" /></td>\`;
      layoutBody.appendChild(tr);
    }
  }

  function renderIo(ioMap){
    const kind = document.getElementById("filterKind").value;
    const crit = document.getElementById("filterCrit").value;
    const search = (document.getElementById("filterSearch").value || "").toLowerCase();

    ioBody.innerHTML = "";
    for (const io of ioMap){
      if (kind && io.kind !== kind) continue;
      if (crit && io.criticality !== crit) continue;
      const hay = [io.id, io.label, io.signal, io.endpoint, io.notes].join(" ").toLowerCase();
      if (search && !hay.includes(search)) continue;

      const tr = document.createElement("tr");
      tr.innerHTML = \`
        <td>\${io.id}</td>
        <td>\${io.label}</td>
        <td>\${io.kind}</td>
        <td>\${io.signal}</td>
        <td>\${io.endpoint}</td>
        <td>\${io.update_hz}</td>
        <td>\${io.latency_ms}</td>
        <td>\${io.criticality}</td>
        <td>\${io.notes || ""}</td>\`;
      ioBody.appendChild(tr);
    }
  }

  function gatherLayout(){
    const mods = [];
    layoutBody.querySelectorAll("tr").forEach(tr => {
      const id = tr.dataset.id;
      const get = (field) => {
        const input = tr.querySelector('[data-field="'+field+'"]');
        return input ? input.value : "";
      };
      mods.push({
        id,
        name: get("name"),
        x_mm: parseFloat(get("x_mm")) || 0,
        y_mm: parseFloat(get("y_mm")) || 0,
        w_mm: parseFloat(get("w_mm")) || 0,
        h_mm: parseFloat(get("h_mm")) || 0,
        z_mm: get("z_mm") === "" ? null : (parseFloat(get("z_mm")) || 0),
        notes: get("notes")
      });
    });
    return mods;
  }

  function fill(payload){
    snapshot = payload || null;
    if (!payload) return;
    if (payload.layout && Array.isArray(payload.layout.modules)){
      renderLayout(payload.layout.modules);
    }
    if (payload.ioMap) renderIo(payload.ioMap);
    if (typeof payload.viewEngineering === "boolean"){
      toggleEngineering.checked = payload.viewEngineering;
      engState.textContent = "Engineering: " + (payload.viewEngineering ? "ON" : "OFF");
      engState.style.borderColor = payload.viewEngineering ? "#35507a" : "#243244";
    }
  }

  document.getElementById("apply").addEventListener("click", () => {
    send("APPLY_LAYOUT", { layout: { modules: gatherLayout() }, viewEngineering: toggleEngineering.checked });
  });
  document.getElementById("refresh").addEventListener("click", () => send("REQ_LAYOUT", {}));
  document.getElementById("export").addEventListener("click", () => {
    if (!snapshot) return;
    const payload = {
      timestamp: new Date().toISOString(),
      world: snapshot.world,
      layout: snapshot.layout,
      ioMap: snapshot.ioMap,
      viewEngineering: snapshot.viewEngineering
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deck.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  document.getElementById("close").addEventListener("click", () => window.close());

  toggleEngineering.addEventListener("change", () => {
    engState.textContent = "Engineering: " + (toggleEngineering.checked ? "ON" : "OFF");
  });

  document.getElementById("filterKind").addEventListener("change", () => snapshot && renderIo(snapshot.ioMap || []));
  document.getElementById("filterCrit").addEventListener("change", () => snapshot && renderIo(snapshot.ioMap || []));
  document.getElementById("filterSearch").addEventListener("input", () => snapshot && renderIo(snapshot.ioMap || []));

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || m.__vt !== 1) return;
    if (m.type === "LAYOUT_SNAPSHOT") fill(m.payload || {});
  });

  send("REQ_LAYOUT", {});
})();
${closeScript}
</body></html>`;
  }

  function openCfgPopup(){
    setPanelForced(true);
    const w = window.open("", "VT_Config", "popup=yes,width=520,height=920");
    if (!w) return popupBlocked();
    w.document.open();
    w.document.write(buildCfgPopupHTML());
    w.document.close();
    popCfg = w;
    setTimeout(()=>pushCfgViewSnapshot(), 80);
  }

  function openHWPopup(){
    setPanelForced(true);
    const w = window.open("", "VT_HW", "popup=yes,width=450,height=860");
    if (!w) return popupBlocked();
    w.document.open();
    w.document.write(buildHWPopupHTML());
    w.document.close();
    popHW = w;
    setTimeout(()=>pushHWSnapshot(true), 80);
  }

  function openLogPopup(){
    setPanelForced(true);
    const w = window.open("", "VT_LOG", "popup=yes,width=820,height=700");
    if (!w) return popupBlocked();
    w.document.open();
    w.document.write(buildLogPopupHTML());
    w.document.close();
    popLog = w;
    setTimeout(()=>pushLogSnapshot(true), 80);
  }

  function openLayoutPopup(){
    setPanelForced(true);
    const w = window.open("", "VT_LAYOUT", "popup=yes,width=980,height=820");
    if (!w) return popupBlocked();
    w.document.open();
    w.document.write(buildLayoutPopupHTML());
    w.document.close();
    popLayout = w;
    setTimeout(()=>pushLayoutSnapshot(true), 80);
  }


  // Mensajes desde ventanas emergentes
  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || m.__vt !== 1) return;

    if (m.type === "REQ_CFG_VIEW"){ pushCfgViewSnapshot(); return; }
    if (m.type === "REQ_HW"){ pushHWSnapshot(true); return; }
    if (m.type === "REQ_LOG"){ pushLogSnapshot(true); return; }
    if (m.type === "REQ_LAYOUT"){ pushLayoutSnapshot(true); return; }

    if (m.type === "APPLY_FIELDS"){
      writeFieldsToMain(m.payload && m.payload.fields ? m.payload.fields : {});
      applyConfig();              // resetea + recalcula cfg
      pushCfgViewSnapshot();      // refleja valores post-apply
      return;
    }

    if (m.type === "SET_VIEW"){
      const v = m.payload || {};
      if (typeof v.timeScale === "number" && isFinite(v.timeScale)){
        const ts = clamp(v.timeScale, 0.25, 25);
        timeScaleEl.value = String(ts);
        timeScale = ts;
        vTimeScale.textContent = `${timeScale.toFixed(2)}×`;
      }
      if (typeof v.showElec === "boolean") showElecEl.checked = v.showElec;
      if (typeof v.showHwLeds === "boolean") showHwLedsEl.checked = v.showHwLeds;
      if (typeof v.showHwLabels === "boolean") showHwLabelsEl.checked = v.showHwLabels;
      if (typeof v.viewEngineering === "boolean") viewEngineeringEl.checked = v.viewEngineering;
      pushCfgViewSnapshot();
      return;
    }

    if (m.type === "APPLY_LAYOUT"){
      const payload = m.payload || {};
      if (payload.layout && Array.isArray(payload.layout.modules)){
        layout.modules = payload.layout.modules.map(mod => ({
          id: mod.id,
          name: String(mod.name || ""),
          x_mm: parseFloat(mod.x_mm) || 0,
          y_mm: parseFloat(mod.y_mm) || 0,
          w_mm: parseFloat(mod.w_mm) || 0,
          h_mm: parseFloat(mod.h_mm) || 0,
          z_mm: (mod.z_mm === null || mod.z_mm === undefined) ? null : (parseFloat(mod.z_mm) || 0),
          notes: String(mod.notes || "")
        }));
      }
      if (typeof payload.viewEngineering === "boolean") viewEngineeringEl.checked = payload.viewEngineering;
      pushLayoutSnapshot(true);
      return;
    }
  });


  // ---------- Bind buttons ----------
  el("btnStart").addEventListener("click", start);
  el("btnPause").addEventListener("click", pauseToggle);
  el("btnReset").addEventListener("click", resetAll);
  el("btnApply").addEventListener("click", applyConfig);
  el("btnPopConfig").addEventListener("click", openCfgPopup);
  el("btnPopHW").addEventListener("click", openHWPopup);
  el("btnPopLog").addEventListener("click", openLogPopup);
  el("btnPopLayout").addEventListener("click", openLayoutPopup);
  el("btnExportRunCsv").addEventListener("click", exportRunReportCsv);
  el("btnExportRunJson").addEventListener("click", exportRunReportJson);

  // Al cambiar vista local, reflejar en la ventana de parámetros.
  timeScaleEl.addEventListener("input", () => pushCfgViewSnapshot());
  showElecEl.addEventListener("change", () => pushCfgViewSnapshot());
  showHwLedsEl.addEventListener("change", () => pushCfgViewSnapshot());
  showHwLabelsEl.addEventListener("change", () => pushCfgViewSnapshot());
  viewEngineeringEl.addEventListener("change", () => {
    pushCfgViewSnapshot();
    pushLayoutSnapshot(true);
    if (!viewEngineeringEl.checked) hideEngTooltip();
  });

  // ---------- Main loop ----------
  let last = performance.now();
  function tick(ts){
    const dtReal = clamp((ts - last)/1000, 0, 0.05);
    last = ts;
    sim.time += dtReal;

    if (sim.mode === "RUNNING"){
      const dt = dtReal * timeScale;

      stepCollector(dt);
      stepAliquot(dt);

      stepPlateMove(dt);
      stepPlateDispatch();

      stepReagent(dt);

      updateDone();
    }

    computeHardware(dtReal * Math.max(1, timeScale));
    // Mantener ventanas emergentes sincronizadas
    if (popCfg && popCfg.closed) popCfg = null;
    if (popHW && popHW.closed) popHW = null;
    if (popLog && popLog.closed) popLog = null;
    if (popLayout && popLayout.closed) popLayout = null;
    setPanelForced(!!(popCfg || popHW || popLog || popLayout));
    pushHWSnapshot(false);
    pushLogSnapshot(false);
    pushLayoutSnapshot(false);
    syncUI();
    updateDashboard();
    updateRunReportButtons();
    draw();
    requestAnimationFrame(tick);
  }

  // ---------- Init ----------
  log("Demo lista. Usá Iniciar, Time-warp y el overlay electrónico (LEDs/Nombres).");
  resetAll();
  requestAnimationFrame(tick);
})();
