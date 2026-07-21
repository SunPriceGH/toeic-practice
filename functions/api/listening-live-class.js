(function(){
  'use strict';

  var STUDENT_KEY = 'toeic_student_session';
  var TEACHER_EMAIL = 'sunprice@sp.ik';
  var LIVE_API = '/api/listening-live';
  /*
   * Các URL dưới đây được giữ đúng y hệt hai trang gốc:
   * toeic-listening-ets2023.html và toeic-listening-ets2024.html.
   */
  var LISTENING_SOURCES = {
    '2023': {
      questions: 'data/listening-transcripts-ets2023-p12.json',
      answers: 'data/listening-answer-keys-ets2023.json',
      tests: {
        1:{id:'ets-toeic-2023-test-1',audioSrc:'audio/ets-toeic-2023-test-1.mp3'},
        2:{id:'ets-toeic-2023-test-2',audioSrc:'audio/ets-toeic-2023-test-2.mp3'},
        3:{id:'ets-toeic-2023-test-3',audioSrc:'audio/ets-toeic-2023-test-3.mp3'},
        4:{id:'ets-toeic-2023-test-4',audioSrc:'audio/ets-toeic-2023-test-4.mp3'},
        5:{id:'ets-toeic-2023-test-5',audioSrc:'audio/ets-toeic-2023-test-5.mp3'},
        6:{id:'ets-toeic-2023-test-6',audioSrc:'audio/ets-toeic-2023-test-6.mp3'},
        7:{id:'ets-toeic-2023-test-7',audioSrc:'audio/ets-toeic-2023-test-7.mp3'},
        8:{id:'ets-toeic-2023-test-8',audioSrc:'audio/ets-toeic-2023-test-8.mp3'},
        9:{id:'ets-toeic-2023-test-9',audioSrc:'audio/ets-toeic-2023-test-9.mp3'},
        10:{id:'ets-toeic-2023-test-10',audioSrc:'audio/ets-toeic-2023-test-10.mp3'}
      }
    },
    '2024': {
      questions: 'data/listening-transcripts-ets2024-p12.json',
      answers: 'data/listening-answer-keys.json',
      tests: {
        1:{id:'ets-toeic-2024-test-1',audioSrc:'audio/ets-toeic-2024-test-1.mp3'},
        2:{id:'ets-toeic-2024-test-2',audioSrc:'audio/ets-toeic-2024-test-2.mp3'},
        3:{id:'ets-toeic-2024-test-3',audioSrc:'audio/ets-toeic-2024-test-3.mp3'},
        4:{id:'ets-toeic-2024-test-4',audioSrc:'audio/ets-toeic-2024-test-4.mp3'},
        5:{id:'ets-toeic-2024-test-5',audioSrc:'audio/ets-toeic-2024-test-5.mp3'},
        6:{id:'ets-toeic-2024-test-6',audioSrc:'audio/ets-toeic-2024-test-6.mp3'},
        7:{id:'ets-toeic-2024-test-7',audioSrc:'audio/ets-toeic-2024-test-7.mp3'},
        8:{id:'ets-toeic-2024-test-8',audioSrc:'audio/ets-toeic-2024-test-8.mp3'},
        9:{id:'ets-toeic-2024-test-9',audioSrc:'audio/ets-toeic-2024-test-9.mp3'},
        10:{id:'ets-toeic-2024-test-10',audioSrc:'audio/ets-toeic-2024-test-10.mp3'}
      }
    }
  };

  var state = {
    year: '2023',
    test: 1,
    part: 1,
    question: 1,
    selection: {},
    checked: {},
    dataCache: {},
    loadingYear: null,
    teacherRows: [],
    teacherTimer: null,
    openDetailEmail: ''
  };

  var els = {};
  var student = null;

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function getStudentSession(){
    try{return JSON.parse(localStorage.getItem(STUDENT_KEY) || 'null');}catch(err){return null;}
  }

  function requireStudentSession(){
    student = getStudentSession();
    if(!student || !student.email){
      var next = location.pathname.split('/').pop() + location.search;
      location.href = 'index.html?next=' + encodeURIComponent(next);
      return false;
    }
    student.email = String(student.email).trim().toLowerCase();
    return true;
  }

  function cacheElements(){
    els.yearSelect = document.getElementById('yearSelect');
    els.testSelect = document.getElementById('testSelect');
    els.testAudio = document.getElementById('testAudio');
    els.audioLabel = document.getElementById('audioLabel');
    els.practiceCard = document.getElementById('practiceCard');
    els.checkBtn = document.getElementById('checkBtn');
    els.prevBtn = document.getElementById('prevBtn');
    els.nextBtn = document.getElementById('nextBtn');
    els.revealBtn = document.getElementById('revealBtn');
    els.slideIndexText = document.getElementById('slideIndexText');
    els.slidePickerBtn = document.getElementById('slidePickerBtn');
    els.slidePickerOverlay = document.getElementById('slidePickerOverlay');
    els.slidePickerContent = document.getElementById('slidePickerContent');
    els.syncState = document.getElementById('syncState');
    els.syncStateText = document.getElementById('syncStateText');
    els.teacherMonitorBtn = document.getElementById('teacherMonitorBtn');
    els.teacherLiveCount = document.getElementById('teacherLiveCount');
    els.teacherOverlay = document.getElementById('teacherOverlay');
    els.monitorSort = document.getElementById('monitorSort');
    els.monitorYear = document.getElementById('monitorYear');
    els.monitorPart = document.getElementById('monitorPart');
    els.monitorRefreshBtn = document.getElementById('monitorRefreshBtn');
    els.monitorClearBtn = document.getElementById('monitorClearBtn');
    els.liveSummary = document.getElementById('liveSummary');
    els.teacherTableHost = document.getElementById('teacherTableHost');
  }

  function buildTestSelect(){
    var html = '';
    for(var i = 1; i <= 10; i++){
      html += '<option value="' + i + '">Test ' + i + '</option>';
    }
    els.testSelect.innerHTML = html;
    els.testSelect.value = String(state.test);
  }

  function questionKey(year, testNo, question){
    return String(year) + '-' + String(testNo) + '-' + String(question);
  }

  function currentKey(){
    return questionKey(state.year, state.test, state.question);
  }

  function currentSource(){
    return LISTENING_SOURCES[state.year] || LISTENING_SOURCES['2024'];
  }

  function currentTestConfig(){
    var source = currentSource();
    return source.tests[state.test] || source.tests[1];
  }

  function currentTestId(){
    return currentTestConfig().id;
  }

  function currentAudioUrl(){
    return currentTestConfig().audioSrc;
  }

  function currentImageUrl(question){
    return 'images/part1/' + currentTestId() + '-q' + question + '.jpg';
  }

  function normalizeQuestionRoot(raw){
    if(!raw || typeof raw !== 'object') return {};
    return raw.LISTENING_TRANSCRIPTS_P12 || raw.transcripts || raw.questions || raw;
  }

  function normalizeAnswerRoot(raw){
    if(!raw || typeof raw !== 'object') return {};
    return raw.answerKeys || raw.answers || raw;
  }

  async function fetchJson(url){
    var response = await fetch(url, {cache:'no-store'});
    if(!response.ok) throw new Error('Không tải được ' + url + ' (' + response.status + ')');
    return response.json();
  }

  async function ensureYearData(year, forceReload){
    if(state.dataCache[year] && !forceReload) return state.dataCache[year];
    if(state.loadingYear === year) return state.loadingPromise;

    var source = LISTENING_SOURCES[year] || LISTENING_SOURCES['2024'];
    var urls = {questions:source.questions, answers:source.answers};
    state.loadingYear = year;

    /*
     * Tải hai file độc lập. Một file thiếu không được phép chặn ảnh, audio,
     * bộ chọn đề hoặc toàn bộ giao diện câu hỏi.
     */
    state.loadingPromise = Promise.allSettled([
      fetchJson(urls.questions),
      fetchJson(urls.answers)
    ]).then(function(results){
      var questionResult = results[0];
      var answerResult = results[1];
      var warnings = [];

      if(questionResult.status !== 'fulfilled'){
        warnings.push(questionResult.reason && questionResult.reason.message ? questionResult.reason.message : 'Không tải được file câu hỏi.');
      }
      if(answerResult.status !== 'fulfilled'){
        warnings.push(answerResult.reason && answerResult.reason.message ? answerResult.reason.message : 'Không tải được file đáp án.');
      }

      var record = {
        questionStore: questionResult.status === 'fulfilled' ? normalizeQuestionRoot(questionResult.value) : {},
        answerStore: answerResult.status === 'fulfilled' ? normalizeAnswerRoot(answerResult.value) : {},
        urls: urls,
        warning: warnings.join(' '),
        error: ''
      };
      state.dataCache[year] = record;
      return record;
    }).finally(function(){
      state.loadingYear = null;
      state.loadingPromise = null;
    });

    return state.loadingPromise;
  }

  function getYearData(){
    var source = currentSource();
    return state.dataCache[state.year] || {
      questionStore:{},
      answerStore:{},
      urls:{questions:source.questions,answers:source.answers},
      warning:'',
      error:''
    };
  }

  function getTestData(){
    var data = getYearData();
    var id = currentTestId();
    return data.questionStore[id] || data.questionStore[String(state.test)] || {};
  }

  function getQuestionEntry(question){
    var testData = getTestData();
    return testData[String(question)] || testData[question] || null;
  }

  function normalizeOptions(entry, part){
    if(!entry) return [];
    var output = [];

    if(Array.isArray(entry.options)){
      entry.options.forEach(function(item, index){
        var label = String(item.label || item.letter || item.option || String.fromCharCode(65 + index)).toUpperCase();
        var text = item.text || item.text_en || item.answer || item.value || label;
        output.push({label:label, text:String(text)});
      });
    }else if(entry.statements && typeof entry.statements === 'object'){
      Object.keys(entry.statements).sort().forEach(function(label){
        output.push({label:String(label).toUpperCase(), text:String(entry.statements[label] || label)});
      });
    }

    if(!output.length && entry.transcript_en){
      String(entry.transcript_en).split(/\r?\n/).forEach(function(line){
        var match = line.match(/^\s*\(([A-D])\)\s*(.+)$/i);
        if(match) output.push({label:match[1].toUpperCase(), text:match[2].trim()});
      });
    }

    var expected = part === 1 ? 4 : 3;
    if(!output.length){
      for(var i = 0; i < expected; i++) output.push({label:String.fromCharCode(65 + i), text:'Option ' + String.fromCharCode(65 + i)});
    }

    return output.slice(0, expected);
  }

  function getPrompt(entry){
    if(!entry) return '';
    if(entry.prompt_en && entry.prompt_en !== 'Photograph description choices') return String(entry.prompt_en);
    if(entry.question_en) return String(entry.question_en);
    if(entry.transcript_en){
      var first = String(entry.transcript_en).split(/\r?\n/)[0] || '';
      if(!/^\s*\([A-D]\)/i.test(first)) return first;
    }
    return '';
  }

  function getCorrectAnswer(question, entry){
    if(entry && entry.correct_option) return String(entry.correct_option).toUpperCase();
    var data = getYearData();
    var answers = data.answerStore[String(state.test)] || data.answerStore[state.test] || [];
    var value = Array.isArray(answers) ? answers[question - 1] : answers[String(question)];
    return value ? String(value).toUpperCase() : '';
  }

  function setSyncState(type, text){
    els.syncState.className = 'sync-state' + (type ? ' ' + type : '');
    els.syncStateText.textContent = text;
  }

  function updateAudio(){
    var src = currentAudioUrl();
    var requestId = state.year + '-' + state.test + '-' + Date.now();

    els.audioLabel.textContent = 'ETS ' + state.year + ' · Test ' + state.test;
    if(els.testAudio.dataset.rawSrc === src) return;

    els.testAudio.pause();
    els.testAudio.dataset.rawSrc = src;
    els.testAudio.dataset.requestId = requestId;

    if(els.testAudio.dataset.objectUrl){
      try{URL.revokeObjectURL(els.testAudio.dataset.objectUrl);}catch(err){}
      delete els.testAudio.dataset.objectUrl;
    }

    /* Cùng cách tải audio đang dùng trong hai trang Listening gốc. */
    fetch(src).then(function(response){
      if(!response.ok) throw new Error('Audio HTTP ' + response.status);
      return response.blob();
    }).then(function(blob){
      if(els.testAudio.dataset.requestId !== requestId) return;
      var objectUrl = URL.createObjectURL(blob);
      els.testAudio.dataset.objectUrl = objectUrl;
      els.testAudio.src = objectUrl;
      els.testAudio.load();
    }).catch(function(){
      if(els.testAudio.dataset.requestId !== requestId) return;
      els.testAudio.src = src;
      els.testAudio.load();
    });
  }

  function setPart(part){
    state.part = Number(part);
    if(state.part === 1 && (state.question < 1 || state.question > 6)) state.question = 1;
    if(state.part === 2 && (state.question < 7 || state.question > 31)) state.question = 7;

    document.querySelectorAll('.part-tab').forEach(function(btn){
      btn.classList.toggle('active', Number(btn.dataset.part) === state.part);
    });
    renderCurrent();
  }

  function setQuestion(question){
    question = Number(question);
    if(question < 1 || question > 31) return;
    state.question = question;
    state.part = question <= 6 ? 1 : 2;
    document.querySelectorAll('.part-tab').forEach(function(btn){
      btn.classList.toggle('active', Number(btn.dataset.part) === state.part);
    });
    closeOverlay(els.slidePickerOverlay);
    renderCurrent();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function renderLoading(){
    els.practiceCard.className = 'practice-card';
    els.practiceCard.innerHTML = '<div class="loading-box">Đang tải dữ liệu ' + escapeHtml(state.year) + '…</div>';
    els.checkBtn.disabled = true;
    els.revealBtn.classList.remove('show');
  }

  function renderPendingPart(){
    els.practiceCard.className = 'practice-card';
    els.practiceCard.innerHTML =
      '<div class="empty-part"><div><div class="empty-icon">🧩</div>' +
      '<h2>Part ' + state.part + ' đang để trống</h2>' +
      '<p>Khung đã được giữ sẵn để nối dữ liệu sau. Phiên bản này chỉ triển khai Part 1 và Part 2.</p></div></div>';
    els.checkBtn.disabled = true;
    els.revealBtn.classList.remove('show');
    els.slideIndexText.textContent = 'Part ' + state.part;
    updateNavButtons();
  }

  function renderDataError(data){
    els.practiceCard.className = 'practice-card';
    els.practiceCard.innerHTML =
      '<div class="empty-part"><div><div class="empty-icon">⚠️</div>' +
      '<h2>Chưa tải được dữ liệu ' + escapeHtml(state.year) + '</h2>' +
      '<p>' + escapeHtml(data.error || 'Không tìm thấy file dữ liệu.') + '</p>' +
      '<p style="margin-top:9px;font-size:15px">URL câu hỏi: <b>' + escapeHtml(data.urls.questions) + '</b><br>URL đáp án: <b>' + escapeHtml(data.urls.answers) + '</b></p>' +
      '</div></div>';
    els.checkBtn.disabled = true;
    els.revealBtn.classList.remove('show');
    updateNavButtons();
  }

  function renderQuestion(){
    var data = getYearData();
    var question = state.question;
    var part = question <= 6 ? 1 : 2;
    var entry = getQuestionEntry(question);
    var options = normalizeOptions(entry, part);
    var correct = getCorrectAnswer(question, entry);
    var key = currentKey();
    var selected = state.selection[key] || '';
    var checked = state.checked[key] || null;
    var imageUrl = currentImageUrl(question);

    var media = '';
    if(part === 1){
      media = '<div class="photo-box"><img src="' + escapeHtml(imageUrl) + '" alt="ETS TOEIC ' + state.year + ' Test ' + state.test + ' Part 1 Question ' + question + '" data-image-url="' + escapeHtml(imageUrl) + '"></div>';
    }else{
      media = '<div class="listen-prompt">🎧 Nghe câu hỏi hoặc câu nói trong audio, sau đó chọn phản hồi phù hợp nhất.</div>';
    }

    var optionHtml = options.map(function(option){
      var classes = ['option'];
      if(selected === option.label) classes.push('selected');
      if(checked){
        if(option.label === checked.correctAnswer) classes.push('correct');
        if(option.label === checked.selected && !checked.isCorrect) classes.push('wrong');
      }
      return '<label class="' + classes.join(' ') + '">' +
        '<input type="radio" name="currentAnswer" value="' + escapeHtml(option.label) + '" ' + (selected === option.label ? 'checked' : '') + '>' +
        '<span class="option-letter">' + escapeHtml(option.label) + '</span>' +
        '<span class="option-text hidden-text">' + escapeHtml(option.text) + '</span>' +
      '</label>';
    }).join('');

    var resultHtml = '';
    if(checked){
      resultHtml = '<div class="result-box show ' + (checked.isCorrect ? '' : 'wrong-result') + '">' +
        '<div class="result-title">' + (checked.isCorrect ? '✓ Chính xác!' : '✗ Chưa đúng. Bạn chọn ' + escapeHtml(checked.selected) + '.') + '</div>' +
        '<div>Đáp án đúng: <b>' + escapeHtml(checked.correctAnswer || 'Chưa có') + '</b></div>' +
      '</div>';
    }

    els.practiceCard.className = 'practice-card' + (checked ? ' revealed' : '');
    els.practiceCard.innerHTML =
      '<div class="question-head">' +
        '<div><div class="question-kicker">ETS TOEIC ' + state.year + ' · Test ' + state.test + ' · Part ' + part + '</div>' +
        '<h2 class="question-title">Question ' + question + '</h2>' +
        '<p class="question-sub">' + (part === 1 ? 'Look at the picture and listen to the four options.' : 'Listen and select the best response.') + '</p></div>' +
        '<div class="question-progress">' + (part === 1 ? question + ' / 6' : (question - 6) + ' / 25') + '</div>' +
      '</div>' + media +
      '<div class="options">' + optionHtml + '</div>' +
      resultHtml;

    var img = els.practiceCard.querySelector('.photo-box img');
    if(img){
      img.addEventListener('error', function(){
        var url = this.getAttribute('data-image-url');
        this.parentNode.innerHTML = '<div class="photo-missing">Không tải được ảnh.<br><b>' + escapeHtml(url) + '</b></div>';
      });
    }

    els.practiceCard.querySelectorAll('input[name="currentAnswer"]').forEach(function(input){
      input.addEventListener('change', function(){
        state.selection[key] = this.value;
        if(state.checked[key]){
          delete state.checked[key];
          persistLocalState();
          renderQuestion();
          return;
        }
        els.practiceCard.querySelectorAll('.option').forEach(function(label){label.classList.remove('selected');});
        this.closest('.option').classList.add('selected');
        els.checkBtn.disabled = !correct;
        if(!correct) els.checkBtn.title = 'Chưa có đáp án cho câu này trong file JSON.';
      });
    });

    els.checkBtn.disabled = !selected || !correct;
    els.checkBtn.title = !correct ? 'Chưa có đáp án cho câu này trong file JSON.' : (!selected ? 'Hãy chọn một option trước.' : 'Kiểm tra đáp án');
    els.revealBtn.classList.toggle('show', !!checked);
    els.revealBtn.textContent = els.practiceCard.classList.contains('revealed') ? '🙈 Ẩn options' : '👁 Hiện options';
    els.slideIndexText.textContent = question + ' / 31';
    updateNavButtons();
    buildSlidePicker();
  }

  async function renderCurrent(){
    if(state.part === 3 || state.part === 4){
      renderPendingPart();
      buildSlidePicker();
      return;
    }

    if(!state.dataCache[state.year]){
      renderLoading();
      await ensureYearData(state.year);
    }
    updateAudio();
    renderQuestion();
  }

  function updateNavButtons(){
    if(state.part === 3 || state.part === 4){
      els.prevBtn.disabled = false;
      els.nextBtn.disabled = true;
      return;
    }
    els.prevBtn.disabled = state.question <= 1;
    els.nextBtn.disabled = state.question >= 31;
  }

  function checkCurrentAnswer(){
    if(state.part !== 1 && state.part !== 2) return;
    var key = currentKey();
    var entry = getQuestionEntry(state.question);
    var correct = getCorrectAnswer(state.question, entry);
    var selected = state.selection[key];
    if(!selected || !correct) return;

    var result = {
      year: Number(state.year),
      test: Number(state.test),
      part: Number(state.part),
      question: Number(state.question),
      selected: String(selected),
      correctAnswer: String(correct),
      isCorrect: String(selected) === String(correct),
      checkedAt: new Date().toISOString()
    };
    state.checked[key] = result;
    persistLocalState();
    renderQuestion();
    sendLiveCheck(result);

    var box = els.practiceCard.querySelector('.result-box');
    if(box) box.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function persistLocalState(){
    try{
      sessionStorage.setItem('listening_live_class_local', JSON.stringify({selection:state.selection, checked:state.checked}));
    }catch(err){}
  }

  function restoreLocalState(){
    try{
      var saved = JSON.parse(sessionStorage.getItem('listening_live_class_local') || 'null');
      if(saved && saved.selection) state.selection = saved.selection;
      if(saved && saved.checked) state.checked = saved.checked;
    }catch(err){}
  }

  async function sendLiveCheck(result){
    if(!student || !student.email || !student.token){
      setSyncState('err', 'Thiếu phiên đăng nhập để gửi');
      return;
    }
    if(student.email === TEACHER_EMAIL){
      setSyncState('ok', 'Tài khoản giáo viên');
      return;
    }

    setSyncState('sending', 'Đang gửi kết quả…');
    try{
      var response = await fetch(LIVE_API, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-student-email':student.email,
          'x-student-token':student.token || ''
        },
        body:JSON.stringify(result),
        keepalive:true
      });
      var data = await response.json().catch(function(){return {};});
      if(!response.ok || !data.ok) throw new Error(data.error || 'Không gửi được kết quả.');
      setSyncState('ok', 'Đã gửi cho giáo viên');
    }catch(err){
      setSyncState('err', err.message || 'Không gửi được kết quả');
    }
  }

  function buildSlidePicker(){
    function section(title, start, end){
      var html = '<div class="slide-section"><h3>' + escapeHtml(title) + '</h3><div class="slide-grid">';
      for(var q = start; q <= end; q++){
        var item = state.checked[questionKey(state.year, state.test, q)];
        var extra = item ? (item.isCorrect ? ' checked-ok' : ' checked-wrong') : '';
        var active = state.part <= 2 && state.question === q ? ' active' : '';
        html += '<button class="slide-btn' + active + extra + '" type="button" data-question="' + q + '">' +
          '<b>Question ' + q + '</b><span>' + (q <= 6 ? 'Part 1 · Photo' : 'Part 2 · Response') + '</span></button>';
      }
      return html + '</div></div>';
    }

    var pending = '<div class="slide-section"><h3>Part 3 + Part 4</h3><div class="slide-grid">' +
      '<button class="slide-btn" type="button" disabled><b>Part 3</b><span>Đang để trống</span></button>' +
      '<button class="slide-btn" type="button" disabled><b>Part 4</b><span>Đang để trống</span></button>' +
      '</div></div>';

    els.slidePickerContent.innerHTML = section('Part 1 · Photographs', 1, 6) + section('Part 2 · Question–Response', 7, 31) + pending;
    els.slidePickerContent.querySelectorAll('[data-question]').forEach(function(btn){
      btn.addEventListener('click', function(){setQuestion(Number(this.dataset.question));});
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
  }

  function closeAllOverlays(){
    document.querySelectorAll('.overlay.show').forEach(function(overlay){closeOverlay(overlay);});
  }

  function updatePageQuery(){
    try{
      var url = new URL(location.href);
      url.searchParams.set('year', state.year);
      url.searchParams.set('test', String(state.test));
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }catch(err){}
  }

  function applyInitialQuery(){
    try{
      var params = new URLSearchParams(location.search);
      var year = params.get('year');
      var test = Number(params.get('test'));
      if(year === '2023' || year === '2024') state.year = year;
      if(test >= 1 && test <= 10) state.test = test;
    }catch(err){}
  }

  function setupEvents(){
    els.yearSelect.addEventListener('change', async function(){
      state.year = String(this.value);
      state.test = Number(els.testSelect.value || 1);
      state.part = 1;
      state.question = 1;
      els.testSelect.value = String(state.test);
      updatePageQuery();
      updateAudio();
      renderLoading();
      await ensureYearData(state.year);
      renderCurrent();
    });

    els.testSelect.addEventListener('change', async function(){
      state.test = Number(this.value || 1);
      state.part = 1;
      state.question = 1;
      this.value = String(state.test);
      updatePageQuery();
      updateAudio();
      renderCurrent();
    });

    document.querySelectorAll('.part-tab').forEach(function(btn){
      btn.addEventListener('click', function(){setPart(Number(this.dataset.part));});
    });

    els.checkBtn.addEventListener('click', checkCurrentAnswer);
    els.prevBtn.addEventListener('click', function(){
      if(state.part === 3 || state.part === 4){setQuestion(31);return;}
      setQuestion(state.question - 1);
    });
    els.nextBtn.addEventListener('click', function(){setQuestion(state.question + 1);});

    els.revealBtn.addEventListener('click', function(){
      els.practiceCard.classList.toggle('revealed');
      this.textContent = els.practiceCard.classList.contains('revealed') ? '🙈 Ẩn options' : '👁 Hiện options';
    });

    els.slidePickerBtn.addEventListener('click', function(){
      buildSlidePicker();
      openOverlay(els.slidePickerOverlay);
    });

    document.querySelectorAll('[data-close-overlay]').forEach(function(btn){
      btn.addEventListener('click', function(){closeOverlay(document.getElementById(this.dataset.closeOverlay));});
    });

    document.querySelectorAll('.overlay').forEach(function(overlay){
      overlay.addEventListener('click', function(event){if(event.target === overlay) closeOverlay(overlay);});
    });

    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape') closeAllOverlays();
      if(document.querySelector('.overlay.show')) return;
      if(event.key === 'ArrowRight') setQuestion(state.question + 1);
      if(event.key === 'ArrowLeft') setQuestion(state.question - 1);
      if(event.key === 'Enter' && !els.checkBtn.disabled) checkCurrentAnswer();
    });

    if(student.email === TEACHER_EMAIL){
      els.teacherMonitorBtn.classList.add('show');
      els.teacherMonitorBtn.addEventListener('click', function(){
        openOverlay(els.teacherOverlay);
        startTeacherPolling();
      });
      els.monitorRefreshBtn.addEventListener('click', loadTeacherRows);
      els.monitorClearBtn.addEventListener('click', clearTeacherSession);
      [els.monitorSort, els.monitorYear, els.monitorPart].forEach(function(control){
        control.addEventListener('change', renderTeacherRows);
      });
    }
  }

  function verifyTeacherSession(){
    return student && student.email === TEACHER_EMAIL && student.token;
  }

  function startTeacherPolling(){
    if(!verifyTeacherSession()) return;
    loadTeacherRows();
    if(state.teacherTimer) clearInterval(state.teacherTimer);
    state.teacherTimer = setInterval(function(){
      if(els.teacherOverlay.classList.contains('show')) loadTeacherRows(true);
    }, 2000);
  }

  async function loadTeacherRows(silent){
    if(!verifyTeacherSession()) return;
    if(!silent) els.monitorRefreshBtn.textContent = 'Đang tải…';
    try{
      var response = await fetch(LIVE_API + '?activeMinutes=360', {
        headers:{
          'x-teacher-email':student.email,
          'x-student-token':student.token || ''
        },
        cache:'no-store'
      });
      var data = await response.json().catch(function(){return {};});
      if(!response.ok || !data.ok) throw new Error(data.error || 'Không tải được dữ liệu lớp.');
      state.teacherRows = Array.isArray(data.students) ? data.students : [];
      renderTeacherRows();
    }catch(err){
      els.teacherTableHost.innerHTML = '<div class="monitor-empty">' + escapeHtml(err.message || 'Không tải được dữ liệu lớp.') + '</div>';
    }finally{
      els.monitorRefreshBtn.textContent = '↻ Cập nhật';
    }
  }

  function rowChecks(record){
    var checks = record && record.checks ? Object.keys(record.checks).map(function(key){return record.checks[key];}) : [];
    var yearFilter = els.monitorYear.value;
    var partFilter = els.monitorPart.value;
    return checks.filter(function(item){
      if(yearFilter !== 'all' && String(item.year) !== yearFilter) return false;
      if(partFilter !== 'all' && String(item.part) !== partFilter) return false;
      return true;
    });
  }

  function summarizeRecord(record){
    var checks = rowChecks(record);
    var correct = checks.filter(function(item){return item.isCorrect;}).length;
    var wrong = checks.length - correct;
    var latest = checks.slice().sort(function(a,b){return new Date(b.checkedAt) - new Date(a.checkedAt);})[0] || record.lastCheck || null;
    return {record:record, checks:checks, correct:correct, wrong:wrong, total:checks.length, latest:latest};
  }

  function statusFor(updatedAt){
    var seconds = Math.max(0, (Date.now() - new Date(updatedAt || 0).getTime()) / 1000);
    if(seconds <= 60) return {className:'online', label:'Đang làm'};
    if(seconds <= 300) return {className:'recent', label:'Vừa hoạt động'};
    return {className:'', label:'Tạm dừng'};
  }

  function sortSummaries(rows){
    var mode = els.monitorSort.value;
    return rows.sort(function(a,b){
      if(mode === 'correct-desc') return b.correct - a.correct || b.total - a.total;
      if(mode === 'correct-asc') return a.correct - b.correct || a.total - b.total;
      if(mode === 'wrong-desc') return b.wrong - a.wrong || b.total - a.total;
      if(mode === 'wrong-asc') return a.wrong - b.wrong || a.total - b.total;
      if(mode === 'test') return Number(a.record.current && a.record.current.year || 0) - Number(b.record.current && b.record.current.year || 0) || Number(a.record.current && a.record.current.test || 0) - Number(b.record.current && b.record.current.test || 0);
      if(mode === 'part') return Number(a.record.current && a.record.current.part || 0) - Number(b.record.current && b.record.current.part || 0);
      if(mode === 'email') return String(a.record.email || '').localeCompare(String(b.record.email || ''));
      return new Date(b.record.updatedAt || 0) - new Date(a.record.updatedAt || 0);
    });
  }

  function renderTeacherRows(){
    var summaries = state.teacherRows.map(summarizeRecord).filter(function(row){return row.total > 0 || (els.monitorYear.value === 'all' && els.monitorPart.value === 'all');});
    sortSummaries(summaries);

    var online = summaries.filter(function(row){return statusFor(row.record.updatedAt).className === 'online';}).length;
    var totalCorrect = summaries.reduce(function(sum,row){return sum + row.correct;},0);
    var totalWrong = summaries.reduce(function(sum,row){return sum + row.wrong;},0);
    els.teacherLiveCount.textContent = String(online);
    els.liveSummary.innerHTML =
      '<span class="summary-pill">Học viên: ' + summaries.length + '</span>' +
      '<span class="summary-pill">Đang làm: ' + online + '</span>' +
      '<span class="summary-pill">Đúng: ' + totalCorrect + '</span>' +
      '<span class="summary-pill">Sai: ' + totalWrong + '</span>';

    if(!summaries.length){
      els.teacherTableHost.innerHTML = '<div class="monitor-empty">Chưa có kết quả phù hợp với bộ lọc hiện tại.</div>';
      return;
    }

    var body = '';
    summaries.forEach(function(row, index){
      var record = row.record;
      var current = record.current || {};
      var latest = row.latest || {};
      var status = statusFor(record.updatedAt);
      var detailId = 'studentDetail' + index;
      var latestText = latest.question ? ('Q' + latest.question + ' · ' + (latest.isCorrect ? 'Đúng' : 'Sai')) : '—';
      var detailHtml = row.checks.slice().sort(function(a,b){return new Date(b.checkedAt) - new Date(a.checkedAt);}).map(function(item){
        return '<div class="check-item ' + (item.isCorrect ? 'ok' : 'bad') + '">' +
          '<b>ETS ' + escapeHtml(item.year) + ' · Test ' + escapeHtml(item.test) + ' · Part ' + escapeHtml(item.part) + ' · Q' + escapeHtml(item.question) + '</b><br>' +
          'Chọn ' + escapeHtml(item.selected) + ' · Đáp án ' + escapeHtml(item.correctAnswer) + ' · ' + (item.isCorrect ? 'ĐÚNG' : 'SAI') +
        '</div>';
      }).join('');

      body += '<tr>' +
        '<td class="live-email">' + escapeHtml(record.email) + '</td>' +
        '<td>ETS ' + escapeHtml(current.year || '—') + ' · Test ' + escapeHtml(current.test || '—') + '</td>' +
        '<td>Part ' + escapeHtml(current.part || '—') + ' · Q' + escapeHtml(current.question || '—') + '</td>' +
        '<td class="score-ok">' + row.correct + '</td>' +
        '<td class="score-wrong">' + row.wrong + '</td>' +
        '<td>' + row.total + '</td>' +
        '<td>' + escapeHtml(latestText) + '</td>' +
        '<td><span class="status-chip ' + status.className + '">● ' + status.label + '</span></td>' +
        '<td><button class="detail-btn" type="button" data-detail="' + detailId + '">Chi tiết</button></td>' +
      '</tr>' +
      '<tr class="student-details" id="' + detailId + '"><td colspan="9"><div class="check-list">' + (detailHtml || 'Chưa có chi tiết.') + '</div></td></tr>';
    });

    els.teacherTableHost.innerHTML = '<div class="live-table-wrap"><table class="live-table"><thead><tr>' +
      '<th>Học viên</th><th>Đề hiện tại</th><th>Slide hiện tại</th><th>Đúng</th><th>Sai</th><th>Đã CHECK</th><th>Lần cuối</th><th>Trạng thái</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';

    els.teacherTableHost.querySelectorAll('[data-detail]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var row = document.getElementById(this.dataset.detail);
        if(row) row.classList.toggle('show');
      });
    });
  }

  async function clearTeacherSession(){
    if(!verifyTeacherSession()) return;
    if(!confirm('Xóa toàn bộ dữ liệu theo dõi của phiên lớp hiện tại?')) return;
    els.monitorClearBtn.disabled = true;
    els.monitorClearBtn.textContent = 'Đang xóa…';
    try{
      var response = await fetch(LIVE_API, {
        method:'DELETE',
        headers:{
          'x-teacher-email':student.email,
          'x-student-token':student.token || ''
        }
      });
      var data = await response.json().catch(function(){return {};});
      if(!response.ok || !data.ok) throw new Error(data.error || 'Không xóa được phiên lớp.');
      state.teacherRows = [];
      renderTeacherRows();
    }catch(err){
      alert(err.message || 'Không xóa được phiên lớp.');
    }finally{
      els.monitorClearBtn.disabled = false;
      els.monitorClearBtn.textContent = 'Xóa phiên lớp';
    }
  }

  async function init(){
    if(!requireStudentSession()) return;
    cacheElements();
    restoreLocalState();
    applyInitialQuery();
    buildTestSelect();
    els.yearSelect.value = state.year;
    els.testSelect.value = String(state.test);
    setupEvents();
    updatePageQuery();
    updateAudio();
    if(student.email === TEACHER_EMAIL) setSyncState('ok', 'Tài khoản giáo viên');
    await ensureYearData(state.year);
    renderCurrent();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
