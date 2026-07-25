(function(){
  'use strict';

  var STUDENT_KEY = 'toeic_student_session';
  var TEACHER_EMAIL = 'sunprice@sp.ik';
  var DATA_URL = '../data/live-lesson.json';
  var LIVE_API = '/api/live-lesson';
  var LOCK_API = '/api/lesson-locks';
  var LOCK_LESSON_ID = 'live-lesson';
  var POLL_MS = 2500;
  var TEACHER_HEARTBEAT_MS = 15000;
  var STUDENT_HEARTBEAT_MS = 10000;
  var MAX_STROKES_PER_SLIDE = 500;
  var MAX_POINTS_PER_STROKE = 5000;

  var state = {
    lesson:null,
    slides:[],
    currentSlide:0,
    activeTeacherSlide:0,
    teacherOnline:false,
    sessionId:'',
    revealIndex:0,
    checked:{},
    selections:{},
    teacherRows:[],
    openDetails:{},
    pollTimer:null,
    heartbeatTimer:null,
    monitorTimer:null,
    syncing:false,
    annotations:{},
    annotationLoading:{},
    penEnabled:false,
    penPanelOpen:true,
    posPanelOpen:false,
    dragPos:null,
    penColor:'#e11d48',
    penWidth:4,
    activeStroke:null,
    activePointerId:null,
    activePath:null,
    annotationSaveTimer:null,
    annotationSaveChains:{}
  };

  var els = {};
  var student = null;

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function normalizeEmail(value){
    return String(value || '').trim().toLowerCase();
  }

  function getStudentSession(){
    try{return JSON.parse(localStorage.getItem(STUDENT_KEY) || 'null');}catch(err){return null;}
  }

  function requireStudentSession(){
    student = getStudentSession();
    if(!student || !student.email || !student.token){
      var next = location.pathname.replace(/^\//,'') + location.search;
      location.href = '../index.html?next=' + encodeURIComponent(next);
      return false;
    }
    student.email = normalizeEmail(student.email);
    return true;
  }

  function isTeacher(){
    return !!(student && student.email === TEACHER_EMAIL);
  }

  function showLessonLocked(message){
    var text = message || 'Bài học này đang được khóa cho học viên.';
    if(els.waitingOverlay){
      els.waitingOverlay.innerHTML = '<div class="waiting-card"><div class="waiting-icon">🔒</div><h2>Bài học đang khóa</h2><p>' + escapeHtml(text) + '</p><a class="waiting-home" href="../index.html#lessons">🏠 Về trang chủ</a></div>';
      els.waitingOverlay.classList.add('show');
    }
    var controlBar = document.querySelector('.control-bar');
    if(controlBar) controlBar.style.display = 'none';
    if(els.slidePickerBtn) els.slidePickerBtn.style.display = 'none';
    if(els.penToggleBtn) els.penToggleBtn.classList.remove('show');
    if(els.teacherMonitorBtn) els.teacherMonitorBtn.classList.remove('show');
    if(els.slideStage){
      els.slideStage.setAttribute('aria-hidden','true');
      els.slideStage.style.pointerEvents = 'none';
    }
    if(els.liveStatus) setLiveStatus('error','Đang khóa học viên');
  }

  async function verifyLessonAccess(){
    if(isTeacher()) return true;
    try{
      var response = await fetch(LOCK_API,{cache:'no-store'});
      var data = await response.json().catch(function(){return {};});
      if(!response.ok || !data.ok) throw new Error(data.error || 'Không tải được trạng thái khóa bài.');
      var lockedIds = Array.isArray(data.lockedLessonIds) ? data.lockedLessonIds.map(String) : [];
      if(lockedIds.indexOf(LOCK_LESSON_ID) >= 0){
        showLessonLocked('Giáo viên chưa mở quyền truy cập Live Lesson.');
        return false;
      }
      return true;
    }catch(err){
      console.error(err);
      showLessonLocked('Không xác minh được trạng thái mở khóa. Hệ thống tạm chặn để bảo vệ nội dung bài học.');
      return false;
    }
  }

  function authHeaders(){
    return {
      'x-student-email':student ? student.email : '',
      'x-student-token':student ? (student.token || '') : ''
    };
  }

  function cacheElements(){
    els.topProgress = document.getElementById('topProgress');
    els.liveStatus = document.getElementById('liveStatus');
    els.liveStatusText = document.getElementById('liveStatusText');
    els.penToggleBtn = document.getElementById('penToggleBtn');
    els.penToolbar = document.getElementById('penToolbar');
    els.penPanelToggle = document.getElementById('penPanelToggle');
    els.penPanelToggleText = document.getElementById('penPanelToggleText');
    els.posToggle = document.getElementById('posToggle');
    els.posToggleIcon = document.getElementById('posToggleIcon');
    els.posList = document.getElementById('posList');
    els.undoPosBtn = document.getElementById('undoPosBtn');
    els.clearPosBtn = document.getElementById('clearPosBtn');
    els.penUndoBtn = document.getElementById('penUndoBtn');
    els.penClearBtn = document.getElementById('penClearBtn');
    els.penCloseBtn = document.getElementById('penCloseBtn');
    els.penSyncStatus = document.getElementById('penSyncStatus');
    els.teacherMonitorBtn = document.getElementById('teacherMonitorBtn');
    els.teacherLiveCount = document.getElementById('teacherLiveCount');
    els.slidePickerBtn = document.getElementById('slidePickerBtn');
    els.slideIndexText = document.getElementById('slideIndexText');
    els.slideStage = document.getElementById('slideStage');
    els.prevBtn = document.getElementById('prevBtn');
    els.goBtn = document.getElementById('goBtn');
    els.nextBtn = document.getElementById('nextBtn');
    els.controlMessage = document.getElementById('controlMessage');
    els.slidePickerOverlay = document.getElementById('slidePickerOverlay');
    els.slidePickerGrid = document.getElementById('slidePickerGrid');
    els.slidePickerSubtitle = document.getElementById('slidePickerSubtitle');
    els.teacherOverlay = document.getElementById('teacherOverlay');
    els.monitorSort = document.getElementById('monitorSort');
    els.monitorRefreshBtn = document.getElementById('monitorRefreshBtn');
    els.monitorClearBtn = document.getElementById('monitorClearBtn');
    els.liveSummary = document.getElementById('liveSummary');
    els.teacherTableHost = document.getElementById('teacherTableHost');
    els.waitingOverlay = document.getElementById('waitingOverlay');
  }

  function setLiveStatus(mode,text){
    els.liveStatus.classList.remove('ok','sending','error');
    if(mode) els.liveStatus.classList.add(mode);
    els.liveStatusText.textContent = text;
  }

  function showControlMessage(text){
    els.controlMessage.textContent = text || 'Học viên theo slide giáo viên đang mở';
    els.controlMessage.classList.add('show');
    clearTimeout(showControlMessage.timer);
    showControlMessage.timer = setTimeout(function(){els.controlMessage.classList.remove('show');},1800);
  }

  async function fetchJson(url,options){
    var response = await fetch(url,options || {});
    var data = await response.json().catch(function(){return {};});
    if(!response.ok || !data.ok && url.indexOf('/api/') >= 0){
      throw new Error(data.error || ('HTTP ' + response.status));
    }
    return data;
  }

  async function loadLessonData(){
    var response = await fetch(DATA_URL,{cache:'no-store'});
    if(!response.ok) throw new Error('Không tải được file dữ liệu bài học (' + response.status + ').');
    var data = await response.json();
    if(!data || !data.lessonId || !Array.isArray(data.slides) || !data.slides.length){
      throw new Error('Dữ liệu bài học không đúng cấu trúc.');
    }
    state.lesson = data;
    state.slides = data.slides;
    document.title = data.title || 'Live Lesson';
  }

  function storageKey(){
    return 'live_lesson_local:' + (state.lesson ? state.lesson.lessonId : 'lesson') + ':' + (student ? student.email : 'guest');
  }

  function restoreLocalState(){
    try{
      var saved = JSON.parse(sessionStorage.getItem(storageKey()) || 'null');
      if(saved && saved.checked) state.checked = saved.checked;
      if(saved && saved.selections) state.selections = saved.selections;
      if(saved && saved.sessionId) state.sessionId = saved.sessionId;
    }catch(err){}
  }

  function persistLocalState(){
    try{
      sessionStorage.setItem(storageKey(),JSON.stringify({checked:state.checked,selections:state.selections,sessionId:state.sessionId}));
    }catch(err){}
  }

  function exerciseKey(slide){
    return slide && slide.exercise ? String(slide.id) + '::' + String(slide.exercise.id) : '';
  }


  function annotationRecord(slideId){
    var id = String(slideId || '');
    if(!state.annotations[id]) state.annotations[id] = {revision:'',strokes:[],posTags:[],updatedAt:null};
    if(!Array.isArray(state.annotations[id].posTags)) state.annotations[id].posTags = [];
    return state.annotations[id];
  }

  function currentSlideData(){
    return state.slides[state.currentSlide] || null;
  }

  function pathData(points){
    if(!Array.isArray(points) || !points.length) return '';
    var first = points[0];
    var path = 'M ' + Number(first.x).toFixed(2) + ' ' + Number(first.y).toFixed(2);
    if(points.length === 1) return path + ' L ' + (Number(first.x) + 0.1).toFixed(2) + ' ' + (Number(first.y) + 0.1).toFixed(2);
    for(var i = 1;i < points.length;i++) path += ' L ' + Number(points[i].x).toFixed(2) + ' ' + Number(points[i].y).toFixed(2);
    return path;
  }

  function renderAnnotationPaths(slideId){
    var record = annotationRecord(slideId);
    return (record.strokes || []).map(function(stroke){
      return '<path data-stroke-id="' + escapeHtml(stroke.id || '') + '" d="' + escapeHtml(pathData(stroke.points)) + '" fill="none" stroke="' + escapeHtml(stroke.color || '#e11d48') + '" stroke-width="' + Number(stroke.width || 4) + '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>';
    }).join('');
  }

  function renderAnnotationLayer(slide,index){
    return '<svg class="annotation-layer" data-annotation-slide="' + escapeHtml(slide.id) + '" data-slide-index="' + index + '" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">' + renderAnnotationPaths(slide.id) + '</svg>';
  }

  function redrawAnnotationLayer(slideId){
    var layer = els.slideStage && els.slideStage.querySelector('.annotation-layer[data-annotation-slide="' + cssEscape(slideId) + '"]');
    if(layer) layer.innerHTML = renderAnnotationPaths(slideId);
  }

  function renderPosTags(slideId){
    return (annotationRecord(slideId).posTags || []).map(function(tag){
      return '<button class="pos-tag ' + escapeHtml(tag.type || '') + '" type="button" data-pos-id="' + escapeHtml(tag.id || '') + '" style="left:' + Math.max(0,Math.min(1,Number(tag.x)||0))*100 + '%;top:' + Math.max(0,Math.min(1,Number(tag.y)||0))*100 + '%">' + escapeHtml(tag.label || '') + '</button>';
    }).join('');
  }

  function renderPosLayer(slide,index){
    return '<div class="pos-layer" data-pos-slide="' + escapeHtml(slide.id) + '" data-slide-index="' + index + '">' + renderPosTags(slide.id) + '</div>';
  }

  function redrawPosLayer(slideId){
    var layer = els.slideStage && els.slideStage.querySelector('.pos-layer[data-pos-slide="' + cssEscape(slideId) + '"]');
    if(layer){layer.innerHTML = renderPosTags(slideId);wirePosTagEvents(layer);}
    applyAnnotationMode();
  }

  function cssEscape(value){
    if(window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value || ''));
    return String(value || '').replace(/["\\]/g,'\\$&');
  }

  function setPenSyncStatus(text,mode){
    if(!els.penSyncStatus) return;
    els.penSyncStatus.textContent = text || '';
    els.penSyncStatus.classList.remove('saving','saved','error');
    if(mode) els.penSyncStatus.classList.add(mode);
  }

  function applyAnnotationMode(){
    if(!els.slideStage) return;
    els.slideStage.querySelectorAll('.annotation-layer').forEach(function(layer){
      var isCurrent = Number(layer.dataset.slideIndex) === state.currentSlide;
      layer.classList.toggle('drawing-enabled',!!(isTeacher() && state.penEnabled && isCurrent));
    });
    els.slideStage.querySelectorAll('.slide').forEach(function(slide){
      slide.classList.toggle('annotation-mode',!!(isTeacher() && state.penEnabled && Number(slide.dataset.slideIndex) === state.currentSlide));
    });
    els.slideStage.querySelectorAll('.pos-layer').forEach(function(layer){
      var isCurrent = Number(layer.dataset.slideIndex) === state.currentSlide;
      layer.classList.toggle('editable',!!(isTeacher() && state.penEnabled && isCurrent));
    });
    if(els.penToggleBtn){
      els.penToggleBtn.classList.toggle('active',!!state.penEnabled);
      els.penToggleBtn.setAttribute('aria-pressed',String(!!state.penEnabled));
      els.penToggleBtn.title = state.penEnabled ? 'Cây viết ACTIVE · Nhấn để DEACTIVE' : 'Cây viết DEACTIVE · Nhấn để ACTIVE';
    }
    if(els.penPanelToggle){
      els.penPanelToggle.classList.toggle('show',!!(isTeacher() && state.penEnabled));
      els.penPanelToggle.setAttribute('aria-expanded',String(!!state.penPanelOpen));
    }
    if(els.penPanelToggleText) els.penPanelToggleText.textContent = state.penPanelOpen ? 'Ẩn công cụ' : 'Mở công cụ';
    if(els.penToolbar) els.penToolbar.classList.toggle('show',!!(isTeacher() && state.penEnabled && state.penPanelOpen));
    if(els.posToggle){els.posToggle.setAttribute('aria-expanded',String(!!state.posPanelOpen));}
    if(els.posToggleIcon) els.posToggleIcon.textContent = state.posPanelOpen ? '▴' : '▾';
    if(els.posList) els.posList.classList.toggle('show',!!(isTeacher() && state.penEnabled && state.penPanelOpen && state.posPanelOpen));
  }

  function setPenEnabled(enabled){
    if(!isTeacher()) return;
    state.penEnabled = !!enabled;
    if(state.penEnabled) state.penPanelOpen = true;
    if(!state.penEnabled){finishActiveStroke(true);state.posPanelOpen=false;cancelPosDrag();}
    applyAnnotationMode();
    showControlMessage(state.penEnabled ? 'Cây viết đã bật · Kéo chuột để ghi lên slide' : 'Đã tắt cây viết');
  }

  function pointFromEvent(layer,event){
    var rect = layer.getBoundingClientRect();
    if(!rect.width || !rect.height) return null;
    return {
      x:Math.max(0,Math.min(1000,((event.clientX - rect.left) / rect.width) * 1000)),
      y:Math.max(0,Math.min(1000,((event.clientY - rect.top) / rect.height) * 1000))
    };
  }

  function makeStrokePath(layer,stroke){
    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('data-stroke-id',stroke.id);
    path.setAttribute('fill','none');
    path.setAttribute('stroke',stroke.color);
    path.setAttribute('stroke-width',String(stroke.width));
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
    path.setAttribute('vector-effect','non-scaling-stroke');
    path.setAttribute('d',pathData(stroke.points));
    layer.appendChild(path);
    return path;
  }

  function startStroke(layer,event){
    if(!isTeacher() || !state.penEnabled || state.dragPos || (event.pointerType === 'mouse' && event.button !== 0)) return;
    var slide = state.slides[Number(layer.dataset.slideIndex)];
    var point = pointFromEvent(layer,event);
    if(!slide || !point) return;
    event.preventDefault();
    try{layer.setPointerCapture(event.pointerId);}catch(err){}
    var record = annotationRecord(slide.id);
    if(record.strokes.length >= MAX_STROKES_PER_SLIDE) record.strokes.shift();
    var stroke = {id:'stroke-' + Date.now() + '-' + Math.random().toString(36).slice(2,8),color:state.penColor,width:state.penWidth,points:[point]};
    record.strokes.push(stroke);
    state.activeStroke = stroke;
    state.activePointerId = event.pointerId;
    state.activePath = makeStrokePath(layer,stroke);
    setPenSyncStatus('Đang viết…','saving');
  }

  function extendStroke(layer,event){
    if(!state.activeStroke || state.activePointerId !== event.pointerId) return;
    var point = pointFromEvent(layer,event);
    if(!point) return;
    event.preventDefault();
    var points = state.activeStroke.points;
    var last = points[points.length - 1];
    var dx = point.x - last.x, dy = point.y - last.y;
    if(dx * dx + dy * dy < 2.25) return;
    if(points.length < MAX_POINTS_PER_STROKE) points.push(point);
    if(state.activePath) state.activePath.setAttribute('d',pathData(points));
  }

  function finishActiveStroke(shouldSave){
    if(!state.activeStroke) return;
    var slide = currentSlideData();
    state.activeStroke = null;
    state.activePointerId = null;
    state.activePath = null;
    if(shouldSave !== false && slide) saveAnnotations(slide.id);
  }

  function wireAnnotationEvents(){
    if(!els.slideStage) return;
    els.slideStage.querySelectorAll('.annotation-layer').forEach(function(layer){
      layer.addEventListener('pointerdown',function(event){startStroke(layer,event);});
      layer.addEventListener('pointermove',function(event){extendStroke(layer,event);});
      layer.addEventListener('pointerup',function(event){if(state.activePointerId === event.pointerId){event.preventDefault();finishActiveStroke(true);}});
      layer.addEventListener('pointercancel',function(event){if(state.activePointerId === event.pointerId) finishActiveStroke(true);});
      layer.addEventListener('lostpointercapture',function(event){if(state.activePointerId === event.pointerId) finishActiveStroke(true);});
    });
  }

  function posTagId(){return 'pos-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);}

  function createPosGhost(type,label,x,y){
    var ghost=document.createElement('div');ghost.className='pos-drag-ghost ' + type;ghost.textContent=label;ghost.style.left=x+'px';ghost.style.top=y+'px';document.body.appendChild(ghost);return ghost;
  }

  function beginPosDrag(config){
    cancelPosDrag();state.dragPos=config;document.body.classList.add('dragging-pos-tag');
    window.addEventListener('pointermove',movePosDrag,true);window.addEventListener('pointerup',endPosDrag,true);window.addEventListener('pointercancel',cancelPosDrag,true);
  }

  function movePosDrag(event){if(!state.dragPos||state.dragPos.pointerId!==event.pointerId)return;event.preventDefault();state.dragPos.ghost.style.left=event.clientX+'px';state.dragPos.ghost.style.top=event.clientY+'px';}

  function endPosDrag(event){
    var drag=state.dragPos;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();
    var slide=els.slideStage.querySelector('.slide.active');var layer=slide&&slide.querySelector('.pos-layer');
    if(layer){var rect=layer.getBoundingClientRect();if(event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom){
      var slideData=currentSlideData(),record=annotationRecord(slideData.id),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
      if(drag.mode==='new') record.posTags.push({id:posTagId(),type:drag.type,label:drag.label,x:x,y:y});
      else {var tag=record.posTags.find(function(item){return item.id===drag.id;});if(tag){tag.x=x;tag.y=y;}}
      redrawPosLayer(slideData.id);saveAnnotations(slideData.id);
    }}
    cancelPosDrag();
  }

  function cancelPosDrag(){
    var drag=state.dragPos;if(drag){if(drag.ghost&&drag.ghost.remove)drag.ghost.remove();if(drag.sourceEl)drag.sourceEl.classList.remove('drag-source');}
    state.dragPos=null;document.body.classList.remove('dragging-pos-tag');window.removeEventListener('pointermove',movePosDrag,true);window.removeEventListener('pointerup',endPosDrag,true);window.removeEventListener('pointercancel',cancelPosDrag,true);
  }

  function startNewPosDrag(event){if(!isTeacher()||!state.penEnabled)return;event.preventDefault();event.stopPropagation();var source=event.currentTarget;beginPosDrag({mode:'new',type:source.dataset.posType,label:source.dataset.posLabel,pointerId:event.pointerId,ghost:createPosGhost(source.dataset.posType,source.dataset.posLabel,event.clientX,event.clientY)});}

  function startMovePosDrag(event){
    if(!isTeacher()||!state.penEnabled)return;event.preventDefault();event.stopPropagation();var el=event.currentTarget,slide=currentSlideData(),record=annotationRecord(slide.id),tag=record.posTags.find(function(item){return item.id===el.dataset.posId;});if(!tag)return;el.classList.add('drag-source');beginPosDrag({mode:'move',id:tag.id,type:tag.type,label:tag.label,pointerId:event.pointerId,sourceEl:el,ghost:createPosGhost(tag.type,tag.label,event.clientX,event.clientY)});
  }

  function wirePosTagEvents(layer){(layer||document).querySelectorAll('.pos-tag').forEach(function(tag){tag.addEventListener('pointerdown',startMovePosDrag);});}
  function wireAllPosTagEvents(){els.slideStage.querySelectorAll('.pos-layer').forEach(wirePosTagEvents);}
  function undoCurrentPos(){var slide=currentSlideData();if(!isTeacher()||!slide)return;var record=annotationRecord(slide.id);if(!record.posTags.length){showControlMessage('Slide này chưa có nhãn để hoàn tác');return;}record.posTags.pop();redrawPosLayer(slide.id);saveAnnotations(slide.id);}
  function clearCurrentPos(){var slide=currentSlideData();if(!isTeacher()||!slide)return;var record=annotationRecord(slide.id);if(!record.posTags.length){showControlMessage('Slide này chưa có nhãn từ loại');return;}if(!confirm('Xóa toàn bộ nhãn từ loại trên Slide '+(state.currentSlide+1)+'?'))return;record.posTags=[];redrawPosLayer(slide.id);saveAnnotations(slide.id);}

  function normalizeClientStrokes(strokes){
    return (strokes || []).slice(-MAX_STROKES_PER_SLIDE).map(function(stroke){
      return {
        id:String(stroke.id || '').slice(0,80),
        color:String(stroke.color || '#e11d48').slice(0,20),
        width:Math.max(1,Math.min(20,Number(stroke.width) || 4)),
        points:(stroke.points || []).slice(0,MAX_POINTS_PER_STROKE).map(function(point){
          return {x:Math.max(0,Math.min(1000,Number(point.x) || 0)),y:Math.max(0,Math.min(1000,Number(point.y) || 0))};
        })
      };
    }).filter(function(stroke){return stroke.points.length;});
  }

  function normalizeClientPosTags(tags){
    return (tags || []).slice(-300).map(function(tag){return {
      id:String(tag.id || '').slice(0,80),type:String(tag.type || '').toLowerCase().replace(/[^a-z]/g,'').slice(0,12),label:String(tag.label || '').slice(0,20),
      x:Math.max(0,Math.min(1,Number(tag.x)||0)),y:Math.max(0,Math.min(1,Number(tag.y)||0))
    };}).filter(function(tag){return tag.id && tag.type && tag.label;});
  }

  function saveAnnotations(slideId){
    if(!isTeacher() || !state.lesson || !slideId) return Promise.resolve();
    var previous = state.annotationSaveChains[slideId] || Promise.resolve();
    var task = previous.catch(function(){}).then(async function(){
      var record = annotationRecord(slideId);
      var strokes = normalizeClientStrokes(record.strokes);
      setPenSyncStatus('Đang đồng bộ…','saving');
      try{
        var data = await fetchJson(LIVE_API,{
          method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify({
            action:'annotation-save',lessonId:state.lesson.lessonId,slideId:slideId,strokes:strokes,posTags:normalizeClientPosTags(record.posTags)
          }),keepalive:true
        });
        record.revision = data.revision || record.revision;
        record.updatedAt = data.updatedAt || new Date().toISOString();
        setPenSyncStatus('Đã đồng bộ','saved');
      }catch(err){
        setPenSyncStatus('Lỗi đồng bộ','error');
        setLiveStatus('error','Không đồng bộ được nét viết');
        throw err;
      }
    });
    state.annotationSaveChains[slideId] = task;
    task.finally(function(){if(state.annotationSaveChains[slideId] === task) delete state.annotationSaveChains[slideId];}).catch(function(){});
    return task;
  }

  async function fetchAnnotations(slideIndex,expectedRevision,force){
    if(!state.lesson) return;
    var slide = state.slides[Number(slideIndex)];
    if(!slide || state.annotationLoading[slide.id]) return;
    var record = annotationRecord(slide.id);
    if(!force && expectedRevision != null && String(record.revision || '') === String(expectedRevision || '')) return;
    state.annotationLoading[slide.id] = true;
    try{
      var url = LIVE_API + '?mode=annotations&lessonId=' + encodeURIComponent(state.lesson.lessonId) + '&slideId=' + encodeURIComponent(slide.id) + '&_=' + Date.now();
      var data = await fetchJson(url,{headers:authHeaders(),cache:'no-store'});
      record.revision = data.revision || '';
      record.updatedAt = data.updatedAt || null;
      record.strokes = normalizeClientStrokes(data.strokes || []);
      record.posTags = normalizeClientPosTags(data.posTags || []);
      redrawAnnotationLayer(slide.id);
      redrawPosLayer(slide.id);
    }catch(err){
      if(isTeacher()) setPenSyncStatus('Không tải được nét','error');
    }finally{delete state.annotationLoading[slide.id];}
  }

  function undoCurrentAnnotation(){
    if(!isTeacher()) return;
    var slide = currentSlideData();
    if(!slide) return;
    var record = annotationRecord(slide.id);
    if(!record.strokes.length){showControlMessage('Slide này chưa có nét để hoàn tác');return;}
    record.strokes.pop();
    redrawAnnotationLayer(slide.id);
    saveAnnotations(slide.id);
  }

  async function clearCurrentAnnotations(){
    if(!isTeacher()) return;
    var slide = currentSlideData();
    if(!slide) return;
    var record = annotationRecord(slide.id);
    if(!record.strokes.length){showControlMessage('Slide này chưa có nét viết');return;}
    if(!confirm('Xóa toàn bộ nét viết trên Slide ' + (state.currentSlide + 1) + '?')) return;
    record.strokes = [];
    redrawAnnotationLayer(slide.id);
    await (state.annotationSaveChains[slide.id] || Promise.resolve()).catch(function(){});
    setPenSyncStatus('Đang xóa…','saving');
    try{
      var data = await fetchJson(LIVE_API,{
        method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify({
          action:'annotation-clear',lessonId:state.lesson.lessonId,slideId:slide.id,posTags:normalizeClientPosTags(record.posTags)
        }),keepalive:true
      });
      record.revision = data.revision || '';
      record.updatedAt = data.updatedAt || new Date().toISOString();
      setPenSyncStatus('Đã xóa','saved');
    }catch(err){setPenSyncStatus('Lỗi xóa nét','error');}
  }

  function renderSlides(){
    var html = '';
    state.slides.forEach(function(slide,index){
      html += '<section class="slide' + (index === state.currentSlide ? ' active' : '') + '" data-slide-index="' + index + '" data-slide-id="' + escapeHtml(slide.id) + '">' +
        '<div class="slide-header"><div><div class="slide-label reveal">' + escapeHtml(slide.label || ('Slide ' + (index + 1))) + '</div>' +
        '<h1 class="slide-title reveal">' + escapeHtml(slide.title || ('Slide ' + (index + 1))) + '</h1></div>' +
        '<div class="slide-no">' + String(index + 1).padStart(2,'0') + '</div></div>' +
        '<div class="slide-content">' + (slide.contentHtml || '') + renderExercise(slide,index) + '</div>' + renderAnnotationLayer(slide,index) + renderPosLayer(slide,index) + '</section>';
    });
    els.slideStage.innerHTML = html;
    wireExerciseEvents();
    wireAnnotationEvents();
    wireAllPosTagEvents();
    applyAnnotationMode();
    revealInitialItems();
    updateNavigation();
    buildSlidePicker();
  }

  function renderExercise(slide,index){
    var exercise = slide.exercise;
    if(!exercise) return '';
    var key = exerciseKey(slide);
    var checked = state.checked[key] || null;
    var selected = checked ? checked.selected : (state.selections[key] || '');
    var locked = !!checked && !isTeacher();
    var html = '<div class="exercise-card reveal" data-exercise-key="' + escapeHtml(key) + '" data-slide-index="' + index + '">' +
      '<div class="exercise-kicker">BÀI TẬP TRỰC TIẾP</div><div class="exercise-question">' + escapeHtml(exercise.question || '') + '</div>';

    if(exercise.type === 'text'){
      html += '<textarea class="text-answer" maxlength="' + Number(exercise.maxLength || 500) + '" placeholder="' + escapeHtml(exercise.placeholder || 'Nhập câu trả lời...') + '"' + (locked ? ' disabled' : '') + '>' + escapeHtml(selected) + '</textarea>';
    }else{
      html += '<div class="exercise-options">';
      (exercise.options || []).forEach(function(option){
        var isSelected = String(selected) === String(option.key);
        var optionClass = 'exercise-option' + (isSelected ? ' selected' : '') + (locked ? ' locked' : '');
        if(checked && checked.isCorrect !== null){
          if(String(option.key) === String(exercise.answer)) optionClass += ' correct';
          else if(isSelected && !checked.isCorrect) optionClass += ' wrong';
        }
        html += '<label class="' + optionClass + '"><input type="radio" name="exercise-' + escapeHtml(key) + '" value="' + escapeHtml(option.key) + '"' + (isSelected ? ' checked' : '') + (locked ? ' disabled' : '') + '>' +
          '<span class="option-key">' + escapeHtml(option.key) + '</span><span class="option-text">' + escapeHtml(option.text) + '</span></label>';
      });
      html += '</div>';
    }

    html += '<div class="exercise-actions"><button class="submit-answer-btn" type="button"' + (locked ? ' disabled' : '') + '>' + (locked ? 'ĐÃ GỬI' : 'CHECK') + '</button>' +
      '<span class="answer-state">' + (checked ? 'Kết quả đã gửi cho giáo viên.' : 'Chưa gửi kết quả.') + '</span></div>' + renderResultBox(exercise,checked) + '</div>';
    return html;
  }

  function renderResultBox(exercise,checked){
    if(!checked) return '<div class="result-box"></div>';
    var className = checked.isCorrect === true ? 'correct' : (checked.isCorrect === false ? 'wrong' : 'submitted');
    var title = checked.isCorrect === true ? '✓ Chính xác!' : (checked.isCorrect === false ? '✗ Chưa đúng.' : '✓ Đã gửi câu trả lời.');
    var explanation = exercise.explanation ? '<div>' + escapeHtml(exercise.explanation) + '</div>' : '';
    return '<div class="result-box show ' + className + '"><div>' + title + '</div>' + explanation + '</div>';
  }

  function wireExerciseEvents(){
    els.slideStage.querySelectorAll('.exercise-option input').forEach(function(input){
      input.addEventListener('change',function(){
        var card = this.closest('.exercise-card');
        if(!card) return;
        var key = card.dataset.exerciseKey;
        state.selections[key] = this.value;
        card.querySelectorAll('.exercise-option').forEach(function(label){label.classList.toggle('selected',!!label.querySelector('input:checked'));});
        persistLocalState();
      });
    });
    els.slideStage.querySelectorAll('.text-answer').forEach(function(input){
      input.addEventListener('input',function(){
        var card = this.closest('.exercise-card');
        if(!card) return;
        state.selections[card.dataset.exerciseKey] = this.value;
        persistLocalState();
      });
    });
    els.slideStage.querySelectorAll('.submit-answer-btn').forEach(function(btn){
      btn.addEventListener('click',function(){submitExercise(this.closest('.exercise-card'));});
    });
  }

  function findSlideByIndex(index){
    return state.slides[index] || null;
  }

  function normalizeText(value){
    return String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
  }

  async function submitExercise(card){
    if(!card) return;
    var slideIndex = Number(card.dataset.slideIndex);
    var slide = findSlideByIndex(slideIndex);
    var exercise = slide && slide.exercise;
    if(!exercise) return;
    var key = exerciseKey(slide);
    if(state.checked[key] && !isTeacher()) return;
    if(!isTeacher() && (!state.teacherOnline || slideIndex !== state.activeTeacherSlide)){
      showControlMessage('Slide này hiện không được giáo viên mở');
      return;
    }

    var selected = '';
    var selectedText = '';
    if(exercise.type === 'text'){
      var textarea = card.querySelector('.text-answer');
      selected = textarea ? textarea.value.trim() : '';
      selectedText = selected;
    }else{
      var checkedInput = card.querySelector('input[type="radio"]:checked');
      selected = checkedInput ? checkedInput.value : '';
      var option = (exercise.options || []).find(function(item){return String(item.key) === String(selected);});
      selectedText = option ? option.text : selected;
    }
    if(!selected){
      card.querySelector('.answer-state').textContent = 'Hãy chọn hoặc nhập câu trả lời trước.';
      return;
    }

    var correctAnswer = null;
    var isCorrect = null;
    if(exercise.type !== 'text' && exercise.answer != null){
      correctAnswer = String(exercise.answer);
      isCorrect = String(selected) === correctAnswer;
    }else if(Array.isArray(exercise.acceptedAnswers) && exercise.acceptedAnswers.length){
      correctAnswer = exercise.acceptedAnswers.join(' / ');
      isCorrect = exercise.acceptedAnswers.some(function(answer){return normalizeText(answer) === normalizeText(selected);});
    }

    var result = {
      action:'answer',
      lessonId:state.lesson.lessonId,
      slideIndex:slideIndex,
      slideId:slide.id,
      slideTitle:slide.title || '',
      exerciseId:exercise.id,
      exerciseType:exercise.type || 'single-choice',
      question:exercise.question || '',
      selected:selected,
      selectedText:selectedText,
      correctAnswer:correctAnswer,
      isCorrect:isCorrect,
      checkedAt:new Date().toISOString()
    };

    var button = card.querySelector('.submit-answer-btn');
    var answerState = card.querySelector('.answer-state');
    button.disabled = true;
    button.textContent = 'ĐANG GỬI…';
    answerState.textContent = isTeacher() ? 'Đang kiểm tra bản xem trước…' : 'Đang gửi cho giáo viên…';

    try{
      if(!isTeacher()){
        var response = await fetchJson(LIVE_API,{
          method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify(result),keepalive:true
        });
        if(response.alreadySubmitted && response.answer) result = response.answer;
      }
      state.checked[key] = result;
      state.selections[key] = selected;
      persistLocalState();
      rerenderCurrentSlide();
      setLiveStatus('ok',isTeacher() ? 'Giáo viên · Bản xem trước' : 'Đã gửi kết quả cho giáo viên');
    }catch(err){
      button.disabled = false;
      button.textContent = 'CHECK';
      answerState.textContent = err.message || 'Không gửi được kết quả.';
      setLiveStatus('error',err.message || 'Lỗi gửi kết quả');
    }
  }

  function rerenderCurrentSlide(){
    var current = state.currentSlide;
    renderSlides();
    showSlide(current,{publish:false,force:true});
  }

  function revealInitialItems(){
    var active = els.slideStage.querySelector('.slide.active');
    if(!active) return;
    var first = active.querySelector('.reveal');
    if(first){first.classList.add('show');state.revealIndex = 1;}
  }

  function resetRevealForSlide(slideEl){
    if(!slideEl) return;
    slideEl.querySelectorAll('.reveal').forEach(function(item){item.classList.remove('show');});
  }

  function goReveal(){
    var active = els.slideStage.querySelector('.slide.active');
    if(!active) return;
    var items = active.querySelectorAll('.reveal');
    if(state.revealIndex < items.length){
      items[state.revealIndex].classList.add('show');
      var target = items[state.revealIndex];
      state.revealIndex++;
      setTimeout(function(){target.scrollIntoView({behavior:'smooth',block:'center'});},60);
      return;
    }
    if(isTeacher()){
      if(state.currentSlide < state.slides.length - 1) showSlide(state.currentSlide + 1,{publish:true});
    }else{
      showControlMessage('Đã hiện hết nội dung · Chờ giáo viên chuyển slide');
    }
  }

  function showSlide(index,options){
    options = options || {};
    index = Math.max(0,Math.min(state.slides.length - 1,Number(index) || 0));
    if(!isTeacher() && !options.force){
      if(!state.teacherOnline || index !== state.activeTeacherSlide){
        showControlMessage('Slide này đang bị khóa');
        return;
      }
    }
    var currentEl = els.slideStage.querySelector('.slide.active');
    if(currentEl){currentEl.classList.remove('active');resetRevealForSlide(currentEl);}
    state.currentSlide = index;
    state.revealIndex = 0;
    var nextEl = els.slideStage.querySelector('.slide[data-slide-index="' + index + '"]');
    if(nextEl){
      nextEl.classList.add('active');
      var first = nextEl.querySelector('.reveal');
      if(first){first.classList.add('show');state.revealIndex = 1;}
    }
    window.scrollTo({top:0,behavior:options.silent ? 'auto' : 'smooth'});
    updateNavigation();
    buildSlidePicker();
    applyAnnotationMode();
    var annotationSlide = state.slides[index];
    var localAnnotation = annotationSlide ? annotationRecord(annotationSlide.id) : null;
    fetchAnnotations(index,null,!isTeacher() || !(localAnnotation && (localAnnotation.revision || localAnnotation.strokes.length)));
    if(isTeacher() && options.publish !== false) publishTeacherSlide();
    if(!isTeacher()) sendStudentHeartbeat();
  }

  function updateNavigation(){
    var total = state.slides.length;
    els.slideIndexText.textContent = total ? (state.currentSlide + 1) + ' / ' + total : '0 / 0';
    els.topProgress.style.width = total ? (((state.currentSlide + 1) / total) * 100) + '%' : '0%';
    if(isTeacher()){
      els.prevBtn.disabled = state.currentSlide <= 0;
      els.nextBtn.disabled = state.currentSlide >= total - 1;
    }else{
      els.prevBtn.disabled = true;
      els.nextBtn.disabled = true;
    }
  }

  function buildSlidePicker(){
    if(!state.slides.length) return;
    els.slidePickerSubtitle.textContent = isTeacher() ? 'Chọn slide để mở cho toàn bộ học viên.' : 'Học viên chỉ được mở slide giáo viên đang dạy.';
    var html = '';
    state.slides.forEach(function(slide,index){
      var allowed = isTeacher() || (state.teacherOnline && index === state.activeTeacherSlide);
      html += '<button class="slide-picker-btn' + (index === state.currentSlide ? ' active' : '') + (!allowed ? ' locked' : '') + '" type="button" data-index="' + index + '"' + (!allowed ? ' disabled' : '') + '>' +
        '<b>' + (allowed ? 'Slide ' : '🔒 Slide ') + (index + 1) + '</b><span>' + escapeHtml((slide.label || '') + ' · ' + (slide.title || '')) + '</span></button>';
    });
    els.slidePickerGrid.innerHTML = html;
    els.slidePickerGrid.querySelectorAll('[data-index]').forEach(function(btn){
      btn.addEventListener('click',function(){showSlide(Number(this.dataset.index),{publish:isTeacher()});closeOverlay(els.slidePickerOverlay);});
    });
  }

  function openOverlay(overlay){
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay(overlay){
    if(!overlay) return;
    overlay.classList.remove('show');
    if(!document.querySelector('.overlay.show')) document.body.style.overflow = '';
    if(overlay === els.teacherOverlay && state.monitorTimer){clearInterval(state.monitorTimer);state.monitorTimer = null;}
  }

  async function publishTeacherSlide(){
    if(!isTeacher() || !state.lesson) return;
    setLiveStatus('sending','Đang mở Slide ' + (state.currentSlide + 1) + ' cho lớp…');
    try{
      var data = await fetchJson(LIVE_API,{
        method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify({
          action:'teacher-sync',lessonId:state.lesson.lessonId,activeSlide:state.currentSlide,slideCount:state.slides.length,slideIds:state.slides.map(function(slide){return slide.id;})
        }),keepalive:true
      });
      state.activeTeacherSlide = state.currentSlide;
      state.teacherOnline = true;
      if(data && data.state && data.state.sessionId) state.sessionId = data.state.sessionId;
      persistLocalState();
      setLiveStatus('ok','LIVE · Đang mở Slide ' + (state.currentSlide + 1));
    }catch(err){
      setLiveStatus('error','Không đồng bộ được slide');
    }
  }

  async function teacherHeartbeat(){
    if(!isTeacher() || !state.lesson) return;
    try{
      await fetchJson(LIVE_API,{
        method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify({
          action:'teacher-heartbeat',lessonId:state.lesson.lessonId,slideCount:state.slides.length,slideIds:state.slides.map(function(slide){return slide.id;})
        }),keepalive:true
      });
      state.teacherOnline = true;
      if(!els.liveStatus.classList.contains('sending')) setLiveStatus('ok','LIVE · Đang mở Slide ' + (state.currentSlide + 1));
    }catch(err){setLiveStatus('error','Mất kết nối lớp LIVE');}
  }

  async function pollClassState(){
    if(isTeacher() || !state.lesson || state.syncing) return;
    state.syncing = true;
    try{
      var url = LIVE_API + '?mode=state&lessonId=' + encodeURIComponent(state.lesson.lessonId) + '&_=' + Date.now();
      var data = await fetchJson(url,{headers:authHeaders(),cache:'no-store'});
      state.teacherOnline = !!data.teacherOnline;
      state.activeTeacherSlide = Math.max(0,Math.min(state.slides.length - 1,Number(data.activeSlide) || 0));
      if(data.sessionId && state.sessionId && data.sessionId !== state.sessionId){
        state.checked = {};
        state.selections = {};
        state.annotations = {};
        state.sessionId = data.sessionId;
        persistLocalState();
        renderSlides();
      }else if(data.sessionId && !state.sessionId){
        state.sessionId = data.sessionId;
        persistLocalState();
      }
      els.waitingOverlay.classList.toggle('show',!state.teacherOnline);
      if(state.teacherOnline){
        setLiveStatus('ok','Đang học LIVE · Slide ' + (state.activeTeacherSlide + 1));
        if(state.currentSlide !== state.activeTeacherSlide) showSlide(state.activeTeacherSlide,{publish:false,force:true});
        await fetchAnnotations(state.activeTeacherSlide,null,true);
      }else{
        setLiveStatus('sending','Đang chờ giáo viên mở lớp');
      }
      buildSlidePicker();
    }catch(err){
      setLiveStatus('error','Không lấy được trạng thái lớp');
    }finally{state.syncing = false;}
  }

  async function sendStudentHeartbeat(){
    if(isTeacher() || !state.lesson) return;
    try{
      await fetchJson(LIVE_API,{
        method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify({
          action:'student-heartbeat',lessonId:state.lesson.lessonId,currentSlide:state.currentSlide
        }),keepalive:true
      });
    }catch(err){}
  }

  function startLiveTimers(){
    if(isTeacher()){
      publishTeacherSlide();
      state.heartbeatTimer = setInterval(teacherHeartbeat,TEACHER_HEARTBEAT_MS);
    }else{
      pollClassState();
      sendStudentHeartbeat();
      state.pollTimer = setInterval(pollClassState,POLL_MS);
      state.heartbeatTimer = setInterval(sendStudentHeartbeat,STUDENT_HEARTBEAT_MS);
    }
  }

  function answerValues(record){
    return record && record.answers ? Object.keys(record.answers).map(function(key){return record.answers[key];}) : [];
  }

  function statusFor(updatedAt){
    var seconds = Math.max(0,(Date.now() - new Date(updatedAt || 0).getTime()) / 1000);
    if(seconds <= 30) return {className:'online',label:'Đang học'};
    if(seconds <= 180) return {className:'recent',label:'Vừa hoạt động'};
    return {className:'',label:'Tạm dừng'};
  }

  async function loadTeacherRows(silent){
    if(!isTeacher()) return;
    if(!silent) els.monitorRefreshBtn.textContent = 'Đang tải…';
    try{
      var url = LIVE_API + '?mode=students&lessonId=' + encodeURIComponent(state.lesson.lessonId) + '&_=' + Date.now();
      var data = await fetchJson(url,{headers:authHeaders(),cache:'no-store'});
      state.teacherRows = Array.isArray(data.students) ? data.students : [];
      renderTeacherRows();
    }catch(err){
      els.teacherTableHost.innerHTML = '<div class="monitor-empty">' + escapeHtml(err.message || 'Không tải được dữ liệu lớp.') + '</div>';
    }finally{els.monitorRefreshBtn.textContent = '↻ Cập nhật';}
  }

  function sortTeacherRows(rows){
    var mode = els.monitorSort.value;
    return rows.sort(function(a,b){
      var aStats = a.stats || {}, bStats = b.stats || {};
      if(mode === 'correct-desc') return Number(bStats.correct || 0) - Number(aStats.correct || 0) || Number(bStats.total || 0) - Number(aStats.total || 0);
      if(mode === 'wrong-desc') return Number(bStats.wrong || 0) - Number(aStats.wrong || 0) || Number(bStats.total || 0) - Number(aStats.total || 0);
      if(mode === 'email') return String(a.email || '').localeCompare(String(b.email || ''));
      if(mode === 'slide') return Number(a.currentSlide || 0) - Number(b.currentSlide || 0);
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }

  function renderTeacherRows(){
    var rows = sortTeacherRows(state.teacherRows.slice());
    var online = rows.filter(function(row){return statusFor(row.lastSeenAt || row.updatedAt).className === 'online';}).length;
    var totals = rows.reduce(function(acc,row){
      var stats = row.stats || {};
      acc.correct += Number(stats.correct || 0);acc.wrong += Number(stats.wrong || 0);acc.submitted += Number(stats.submitted || 0);return acc;
    },{correct:0,wrong:0,submitted:0});
    els.teacherLiveCount.textContent = String(online);
    els.liveSummary.innerHTML = '<span class="summary-pill">Học viên: ' + rows.length + '</span><span class="summary-pill">Đang học: ' + online + '</span>' +
      '<span class="summary-pill">Đúng: ' + totals.correct + '</span><span class="summary-pill">Sai: ' + totals.wrong + '</span><span class="summary-pill">Câu mở: ' + totals.submitted + '</span>';
    if(!rows.length){els.teacherTableHost.innerHTML = '<div class="monitor-empty">Chưa có học viên tham gia phiên lớp này.</div>';return;}

    var body = '';
    rows.forEach(function(record,index){
      var answers = answerValues(record).sort(function(a,b){return new Date(b.checkedAt || 0) - new Date(a.checkedAt || 0);});
      var stats = record.stats || {correct:0,wrong:0,submitted:0,total:0};
      var status = statusFor(record.lastSeenAt || record.updatedAt);
      var detailId = 'liveStudentDetail' + index;
      var detailKey = String(record.email || '');
      var details = answers.map(function(answer){
        var className = answer.isCorrect === true ? 'ok' : (answer.isCorrect === false ? 'bad' : 'open');
        var resultText = answer.isCorrect === true ? 'ĐÚNG' : (answer.isCorrect === false ? 'SAI' : 'ĐÃ GỬI');
        return '<div class="answer-item ' + className + '"><b>Slide ' + (Number(answer.slideIndex || 0) + 1) + ' · ' + escapeHtml(answer.slideTitle || answer.slideId) + '</b><br>' +
          escapeHtml(answer.question || '') + '<br><b>Trả lời:</b> ' + escapeHtml(answer.selectedText || answer.selected) + ' · ' + resultText + '</div>';
      }).join('');
      body += '<tr><td class="live-email">' + escapeHtml(record.email) + '</td><td>Slide ' + (Number(record.currentSlide || 0) + 1) + '</td>' +
        '<td class="score-ok">' + Number(stats.correct || 0) + '</td><td class="score-wrong">' + Number(stats.wrong || 0) + '</td><td>' + Number(stats.submitted || 0) + '</td>' +
        '<td><span class="status-chip ' + status.className + '">● ' + status.label + '</span></td><td><button class="detail-btn" type="button" data-detail="' + detailId + '" data-key="' + escapeHtml(detailKey) + '">Chi tiết</button></td></tr>' +
        '<tr class="student-details' + (state.openDetails[detailKey] ? ' show' : '') + '" id="' + detailId + '"><td colspan="7"><div class="answer-list">' + (details || 'Chưa có câu trả lời.') + '</div></td></tr>';
    });
    els.teacherTableHost.innerHTML = '<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Học viên</th><th>Vị trí</th><th>Đúng</th><th>Sai</th><th>Câu mở</th><th>Trạng thái</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>';
    els.teacherTableHost.querySelectorAll('[data-detail]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var row = document.getElementById(this.dataset.detail);var key = this.dataset.key;if(!row) return;
        var open = !row.classList.contains('show');row.classList.toggle('show',open);if(open) state.openDetails[key] = true;else delete state.openDetails[key];
      });
    });
  }

  async function clearTeacherSession(){
    if(!isTeacher() || !confirm('Xóa toàn bộ dữ liệu học viên trong phiên lớp hiện tại?')) return;
    els.monitorClearBtn.disabled = true;els.monitorClearBtn.textContent = 'Đang xóa…';
    try{
      var url = LIVE_API + '?lessonId=' + encodeURIComponent(state.lesson.lessonId);
      await fetchJson(url,{method:'DELETE',headers:authHeaders()});
      state.teacherRows = [];state.openDetails = {};state.checked = {};state.selections = {};state.annotations = {};state.sessionId = '';persistLocalState();renderSlides();renderTeacherRows();await publishTeacherSlide();
    }catch(err){alert(err.message || 'Không xóa được phiên lớp.');}
    finally{els.monitorClearBtn.disabled = false;els.monitorClearBtn.textContent = 'Xóa phiên lớp';}
  }

  function setupEvents(){
    els.penToggleBtn.addEventListener('click',function(){setPenEnabled(!state.penEnabled);});
    els.penCloseBtn.addEventListener('click',function(){state.penPanelOpen=false;applyAnnotationMode();});
    els.penPanelToggle.addEventListener('click',function(){if(!state.penEnabled)return;state.penPanelOpen=!state.penPanelOpen;applyAnnotationMode();});
    els.posToggle.addEventListener('click',function(){state.posPanelOpen=!state.posPanelOpen;applyAnnotationMode();});
    els.undoPosBtn.addEventListener('click',undoCurrentPos);
    els.clearPosBtn.addEventListener('click',clearCurrentPos);
    document.querySelectorAll('.pos-source').forEach(function(btn){btn.addEventListener('pointerdown',startNewPosDrag);});
    els.penUndoBtn.addEventListener('click',undoCurrentAnnotation);
    els.penClearBtn.addEventListener('click',clearCurrentAnnotations);
    document.querySelectorAll('[data-pen-color]').forEach(function(btn){
      btn.addEventListener('click',function(){
        state.penColor = this.dataset.penColor || '#e11d48';
        document.querySelectorAll('[data-pen-color]').forEach(function(item){item.classList.toggle('active',item === btn);});
      });
    });
    document.querySelectorAll('[data-pen-width]').forEach(function(btn){
      btn.addEventListener('click',function(){
        state.penWidth = Math.max(1,Math.min(20,Number(this.dataset.penWidth) || 4));
        document.querySelectorAll('[data-pen-width]').forEach(function(item){item.classList.toggle('active',item === btn);});
      });
    });
    els.prevBtn.addEventListener('click',function(){if(isTeacher()) showSlide(state.currentSlide - 1,{publish:true});else showControlMessage('Chờ giáo viên chuyển slide');});
    els.nextBtn.addEventListener('click',function(){if(isTeacher()) showSlide(state.currentSlide + 1,{publish:true});else showControlMessage('Chờ giáo viên chuyển slide');});
    els.goBtn.addEventListener('click',goReveal);
    els.slidePickerBtn.addEventListener('click',function(){buildSlidePicker();openOverlay(els.slidePickerOverlay);});
    els.teacherMonitorBtn.addEventListener('click',function(){
      if(!isTeacher()) return;openOverlay(els.teacherOverlay);loadTeacherRows();
      if(state.monitorTimer) clearInterval(state.monitorTimer);
      state.monitorTimer = setInterval(function(){if(els.teacherOverlay.classList.contains('show')) loadTeacherRows(true);},2000);
    });
    els.monitorRefreshBtn.addEventListener('click',function(){loadTeacherRows();});
    els.monitorClearBtn.addEventListener('click',clearTeacherSession);
    els.monitorSort.addEventListener('change',renderTeacherRows);
    document.querySelectorAll('[data-close]').forEach(function(btn){btn.addEventListener('click',function(){closeOverlay(document.getElementById(this.dataset.close));});});
    document.querySelectorAll('.overlay').forEach(function(overlay){overlay.addEventListener('click',function(event){if(event.target === overlay) closeOverlay(overlay);});});
    document.addEventListener('keydown',function(event){
      if(event.key === 'Escape'){if(state.dragPos){cancelPosDrag();return;}if(state.penEnabled && state.penPanelOpen){state.penPanelOpen=false;applyAnnotationMode();return;}if(state.penEnabled){setPenEnabled(false);return;}document.querySelectorAll('.overlay.show').forEach(closeOverlay);return;}
      if(event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if(state.penEnabled) return;
      if(event.code === 'Space' || event.code === 'Enter'){event.preventDefault();goReveal();}
      if(event.code === 'ArrowRight'){event.preventDefault();if(isTeacher()) showSlide(state.currentSlide + 1,{publish:true});else showControlMessage('Chờ giáo viên chuyển slide');}
      if(event.code === 'ArrowLeft'){event.preventDefault();if(isTeacher()) showSlide(state.currentSlide - 1,{publish:true});else showControlMessage('Chờ giáo viên chuyển slide');}
    });
  }

  async function init(){
    try{
      if(!requireStudentSession()) return;
      cacheElements();
      if(!(await verifyLessonAccess())) return;
      setupEvents();
      await loadLessonData();
      restoreLocalState();
      if(isTeacher()){
        els.penToggleBtn.classList.add('show');
        els.teacherMonitorBtn.classList.add('show');
        els.waitingOverlay.classList.remove('show');
        setLiveStatus('ok','Giáo viên · Toàn quyền slide');
      }else{
        els.penToggleBtn.classList.remove('show');
        els.teacherMonitorBtn.classList.remove('show');
        els.waitingOverlay.classList.add('show');
      }
      renderSlides();
      showSlide(0,{publish:false,force:true,silent:true});
      startLiveTimers();
    }catch(err){
      console.error(err);
      if(els.slideStage){
        els.slideStage.innerHTML = '<section class="slide active"><div class="slide-content"><div class="hero-placeholder show"><span class="hero-icon">⚠</span><h3>Không khởi tạo được bài học</h3><p>' + escapeHtml(err.message || String(err)) + '</p></div></div></section>';
      }
      if(els.liveStatus) setLiveStatus('error','Lỗi khởi tạo bài học');
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
