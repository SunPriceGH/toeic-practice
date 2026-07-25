(function(){
  'use strict';

  var STUDENT_KEY = 'toeic_student_session';
  var TEACHER_EMAIL = 'sunprice@sp.ik';
  var DATA_URL = '../data/live-lesson.json';
  var LIVE_API = '/api/live-lesson';
  var POLL_MS = 2500;
  var TEACHER_HEARTBEAT_MS = 15000;
  var STUDENT_HEARTBEAT_MS = 10000;

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
    syncing:false
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

  function renderSlides(){
    var html = '';
    state.slides.forEach(function(slide,index){
      html += '<section class="slide' + (index === state.currentSlide ? ' active' : '') + '" data-slide-index="' + index + '" data-slide-id="' + escapeHtml(slide.id) + '">' +
        '<div class="slide-header"><div><div class="slide-label reveal">' + escapeHtml(slide.label || ('Slide ' + (index + 1))) + '</div>' +
        '<h1 class="slide-title reveal">' + escapeHtml(slide.title || ('Slide ' + (index + 1))) + '</h1></div>' +
        '<div class="slide-no">' + String(index + 1).padStart(2,'0') + '</div></div>' +
        '<div class="slide-content">' + (slide.contentHtml || '') + renderExercise(slide,index) + '</div></section>';
    });
    els.slideStage.innerHTML = html;
    wireExerciseEvents();
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
          action:'teacher-sync',lessonId:state.lesson.lessonId,activeSlide:state.currentSlide,slideCount:state.slides.length
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
          action:'teacher-heartbeat',lessonId:state.lesson.lessonId,slideCount:state.slides.length
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
      state.teacherRows = [];state.openDetails = {};state.checked = {};state.selections = {};state.sessionId = '';persistLocalState();renderSlides();renderTeacherRows();await publishTeacherSlide();
    }catch(err){alert(err.message || 'Không xóa được phiên lớp.');}
    finally{els.monitorClearBtn.disabled = false;els.monitorClearBtn.textContent = 'Xóa phiên lớp';}
  }

  function setupEvents(){
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
      if(event.key === 'Escape'){document.querySelectorAll('.overlay.show').forEach(closeOverlay);return;}
      if(event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if(event.code === 'Space' || event.code === 'Enter'){event.preventDefault();goReveal();}
      if(event.code === 'ArrowRight'){event.preventDefault();if(isTeacher()) showSlide(state.currentSlide + 1,{publish:true});else showControlMessage('Chờ giáo viên chuyển slide');}
      if(event.code === 'ArrowLeft'){event.preventDefault();if(isTeacher()) showSlide(state.currentSlide - 1,{publish:true});else showControlMessage('Chờ giáo viên chuyển slide');}
    });
  }

  async function init(){
    try{
      if(!requireStudentSession()) return;
      cacheElements();
      setupEvents();
      await loadLessonData();
      restoreLocalState();
      if(isTeacher()){
        els.teacherMonitorBtn.classList.add('show');
        els.waitingOverlay.classList.remove('show');
        setLiveStatus('ok','Giáo viên · Toàn quyền slide');
      }else{
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
