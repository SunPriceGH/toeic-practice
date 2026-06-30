
var TESTS = {
  1: {id:'ets-toeic-2024-test-1', title:'ETS TOEIC 2024 Test 1', audioSrc:'audio/ets-toeic-2024-test-1.mp3'},
  2: {id:'ets-toeic-2024-test-2', title:'ETS TOEIC 2024 Test 2', audioSrc:'audio/ets-toeic-2024-test-2.mp3'},
  3: {id:'ets-toeic-2024-test-3', title:'ETS TOEIC 2024 Test 3', audioSrc:'audio/ets-toeic-2024-test-3.mp3'},
  4: {id:'ets-toeic-2024-test-4', title:'ETS TOEIC 2024 Test 4', audioSrc:'audio/ets-toeic-2024-test-4.mp3'},
  5: {id:'ets-toeic-2024-test-5', title:'ETS TOEIC 2024 Test 5', audioSrc:'audio/ets-toeic-2024-test-5.mp3'},
  6: {id:'ets-toeic-2024-test-6', title:'ETS TOEIC 2024 Test 6', audioSrc:'audio/ets-toeic-2024-test-6.mp3'},
  7: {id:'ets-toeic-2024-test-7', title:'ETS TOEIC 2024 Test 7', audioSrc:'audio/ets-toeic-2024-test-7.mp3'},
  8: {id:'ets-toeic-2024-test-8', title:'ETS TOEIC 2024 Test 8', audioSrc:'audio/ets-toeic-2024-test-8.mp3'},
  9: {id:'ets-toeic-2024-test-9', title:'ETS TOEIC 2024 Test 9', audioSrc:'audio/ets-toeic-2024-test-9.mp3'},
  10:{id:'ets-toeic-2024-test-10',title:'ETS TOEIC 2024 Test 10',audioSrc:'audio/ets-toeic-2024-test-10.mp3'}
};
var testParam = new URLSearchParams(location.search).get('test') || '6';
var selectedTest = TESTS[testParam] || TESTS[6];
var LISTENING_CONFIG = {
  id:selectedTest.id,
  title:selectedTest.title,
  audioSrc:selectedTest.audioSrc,
  durationSeconds: 45 * 60,
  // Thay bằng đáp án thật của từng đề nếu bạn muốn chấm điểm chính xác.
  answerKey: [
    'A','B','C','D','A','B','C','D','A','B',
    'C','D','A','B','C','D','A','B','C','D',
    'A','B','C','A','B','C','A','B','C','A',
    'A','B','C','D','A','B','C','D','A','B',
    'C','D','A','B','C','D','A','B','C','D',
    'A','B','C','D','A','B','C','D','A','B',
    'C','D','A','B','C','D','A','B','C','D',
    'A','B','C','D','A','B','C','D','A','B',
    'C','D','A','B','C','D','A','B','C','D',
    'A','B','C','D','A','B','C','D','A','B'
  ]
};

function applyListeningTest(testNo){
  selectedTest=TESTS[testNo]||TESTS[6];
  LISTENING_CONFIG.id=selectedTest.id;
  LISTENING_CONFIG.title=selectedTest.title;
  LISTENING_CONFIG.audioSrc=selectedTest.audioSrc;
  document.title=LISTENING_CONFIG.title;
  var startHead=document.querySelector('.start-head');
  if(startHead) startHead.textContent=LISTENING_CONFIG.title;
  var audio=document.getElementById('testAudio');
  if(audio) audio.src=LISTENING_CONFIG.audioSrc;
  var fileName=document.getElementById('audioFileName');
  if(fileName) fileName.textContent=LISTENING_CONFIG.audioSrc.split('/').pop();
  var testName=document.getElementById('testName');
  if(testName) testName.textContent=LISTENING_CONFIG.title;
}
function changeListeningTest(testNo){
  requestSwitchTest(testNo);
}
function requestSwitchTest(testNo){
  if(!TESTS[testNo]) testNo='6';
  var currentValue=getCurrentTestNo();
  if(testNo===currentValue) return;
  if(state.started&&!state.submitted){
    state.pendingTest=testNo;
    document.getElementById('switchSummary').textContent='Đổi sang '+TESTS[testNo].title+'?';
    document.getElementById('switchModal').classList.add('show');
    syncTestSelects(currentValue);
    return;
  }
  switchToTest(testNo);
}
function cancelSwitchTest(){
  state.pendingTest=null;
  document.getElementById('switchModal').classList.remove('show');
  syncTestSelects(getCurrentTestNo());
}
function confirmSwitchTest(){
  var testNo=state.pendingTest||'6';
  document.getElementById('switchModal').classList.remove('show');
  switchToTest(testNo);
}
function getCurrentTestNo(){
  for(var key in TESTS){
    if(TESTS[key].id===LISTENING_CONFIG.id) return String(key);
  }
  return '6';
}
function syncTestSelects(testNo){
  var topSelect=document.getElementById('testSelect');
  var sideSelect=document.getElementById('sideTestSelect');
  if(topSelect) topSelect.value=String(testNo);
  if(sideSelect) sideSelect.value=String(testNo);
}
function switchToTest(testNo){
  if(state.timerId) clearInterval(state.timerId);
  var audio=document.getElementById('testAudio');
  if(audio){
    audio.pause();
    try{audio.currentTime=0;}catch(e){}
  }
  applyListeningTest(testNo);
  syncTestSelects(testNo);
  state.current=1;
  state.started=false;
  state.submitted=false;
  state.pendingTest=null;
  state.remaining=LISTENING_CONFIG.durationSeconds;
  state.answers={};
  state.flags={};
  state.timerId=null;
  document.getElementById('audioStatus').textContent='Audio not started';
  document.getElementById('audioPulse').classList.remove('playing');
  document.getElementById('startStatus').textContent='';
  document.getElementById('startStatus').className='submit-status';
  document.getElementById('startOverlay').style.display='flex';
  renderQuestion();
  updateTimer();
}

var STUDENT_KEY='toeic_student_session';
var state={current:1,started:false,submitted:false,remaining:LISTENING_CONFIG.durationSeconds,answers:{},flags:{},timerId:null,pendingTest:null};
var parts=[
  {no:1,start:1,end:6,title:'Part 1: Photographs',instruction:'You will hear four statements about a picture. Select the statement that best describes what you see.'},
  {no:2,start:7,end:31,title:'Part 2: Question-Response',instruction:'You will hear a question or statement and three responses. Select the best response.'},
  {no:3,start:32,end:70,title:'Part 3: Conversations',instruction:'You will hear conversations. Each conversation has three questions. Select the best answer.'},
  {no:4,start:71,end:100,title:'Part 4: Talks',instruction:'You will hear talks. Each talk has three questions. Select the best answer.'}
];

function getStudentSession(){
  try{return JSON.parse(localStorage.getItem(STUDENT_KEY)||'null');}catch(e){return null;}
}
function requireStudentSession(){
  var student=getStudentSession();
  if(!student||!student.email){
    alert('Bạn cần đăng nhập bằng email đã được cấp quyền trước khi làm bài.');
    location.href='index.html?next='+encodeURIComponent(location.pathname.split('/').pop()+location.search);
    return null;
  }
  return student;
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});}
function getPart(q){
  for(var i=0;i<parts.length;i++){
    if(q>=parts[i].start&&q<=parts[i].end) return parts[i];
  }
  return parts[0];
}
function getChoices(q){
  if(q>=7&&q<=31) return ['A','B','C'];
  return ['A','B','C','D'];
}
function getCurrentTestData(){
  var testNo=getCurrentTestNo ? getCurrentTestNo() : String(testParam||'6');
  return (window.LISTENING_DATA && window.LISTENING_DATA[testNo]) ? window.LISTENING_DATA[testNo] : null;
}
function getQuestionData(q){
  var data=getCurrentTestData();
  if(!data) return null;
  var arr=q<=70 ? data.part3 : data.part4;
  for(var i=0;i<arr.length;i++){
    if(Number(arr[i].no)===Number(q)) return arr[i];
  }
  return null;
}
function getSetQuestions(q){
  var data=getCurrentTestData();
  if(!data || q<32) return [];
  var arr=q<=70 ? data.part3 : data.part4;
  var start=q<=70?32+Math.floor((q-32)/3)*3:71+Math.floor((q-71)/3)*3;
  var end=Math.min(start+2,q<=70?70:100);
  var out=[];
  for(var i=0;i<arr.length;i++){
    if(arr[i].no>=start && arr[i].no<=end) out.push(arr[i]);
  }
  return out;
}
function questionText(q){
  if(q<=6) return 'Look at the picture marked No. '+q+' in your test screen.';
  if(q<=31) return 'Mark your answer after listening to the question and responses.';
  var item=getQuestionData(q);
  return item && item.question_en ? item.question_en : 'Question '+q+'. Select the best answer based on what you hear.';
}
function questionTextVi(q){
  var item=getQuestionData(q);
  return item && item.question_vi ? item.question_vi : '';
}
function choiceText(q,key){
  if(q<=31) return key;
  var item=getQuestionData(q);
  if(item && item.options){
    for(var i=0;i<item.options.length;i++){
      if(item.options[i].letter===key) return item.options[i].text_en || key;
    }
  }
  return key+'. Answer choice '+key+' for question '+q;
}
function choiceTextVi(q,key){
  var item=getQuestionData(q);
  if(item && item.options){
    for(var i=0;i<item.options.length;i++){
      if(item.options[i].letter===key) return item.options[i].text_vi || '';
    }
  }
  return '';
}
function part1PhotoPath(q){
  return 'images/part1/'+LISTENING_CONFIG.id+'-q'+q+'.jpg';
}
function buildShell(){
  var student=requireStudentSession();
  if(!student) return;
  var select=document.getElementById('testSelect');
  if(select) select.value=String(TESTS[testParam]?testParam:'6');
  syncTestSelects(select?select.value:testParam);
  applyListeningTest(select?select.value:testParam);
  document.getElementById('candidateEmail').textContent='Candidate: '+student.email;
  var tabsHtml='';
  for(var t=0;t<parts.length;t++){
    tabsHtml+='<button class="part-tab" type="button" onclick="goQuestion('+parts[t].start+')" id="partTab'+parts[t].no+'">Part '+parts[t].no+'</button>';
  }
  document.getElementById('partTabs').innerHTML=tabsHtml;
  var gridHtml='';
  for(var i=1;i<=100;i++){
    gridHtml+='<button class="qbtn" type="button" id="qbtn'+i+'" onclick="goQuestion('+i+')">'+i+'</button>';
  }
  document.getElementById('questionGrid').innerHTML=gridHtml;
  renderQuestion();
  updateTimer();
}
function renderQuestion(){
  var q=state.current;
  var part=getPart(q);
  document.getElementById('partTitle').textContent=part.title;
  document.getElementById('partInstruction').textContent=part.instruction;
  document.getElementById('currentPart').textContent='Part '+part.no;
  for(var p=0;p<parts.length;p++){
    document.getElementById('partTab'+parts[p].no).classList.toggle('active',parts[p].no===part.no);
  }
  var choices=getChoices(q);
  var media='';
  if(q<=6){
    media='<div class="photo-box"><img src="'+part1PhotoPath(q)+'" alt="Part 1 photo question '+q+'" onerror="this.parentNode.innerHTML=\'Photo '+q+' not found: '+part1PhotoPath(q)+'\';"></div>';
  }else if(q>=32){
    var setStart=q<=70?32+Math.floor((q-32)/3)*3:71+Math.floor((q-71)/3)*3;
    var setEnd=Math.min(setStart+2,q<=70?70:100);
    var setItems=getSetQuestions(q);
    var setHtml='';
    for(var si=0;si<setItems.length;si++){
      var vi=setItems[si].question_vi ? '<span class="vi">'+escapeHtml(setItems[si].question_vi)+'</span>' : '';
      setHtml+='<div class="set-question"><b>Q'+setItems[si].no+'.</b> '+escapeHtml(setItems[si].question_en||'')+vi+'</div>';
    }
    var tr=getQuestionData(q);
    var transcript='';
    if(tr && (tr.transcript_en || tr.transcript_vi)){
      transcript='<div class="transcript-box"><b>Transcript</b><br>'+escapeHtml(tr.transcript_en||'')+(tr.transcript_vi?'<br><span class="vi">'+escapeHtml(tr.transcript_vi)+'</span>':'')+'</div>';
    }
    media='<div class="set-box"><h3>Questions '+setStart+'-'+setEnd+'</h3><div class="set-questions">'+setHtml+'</div>'+transcript+'</div>';
  }
  var answersHtml='';
  for(var c=0;c<choices.length;c++){
    var key=choices[c];
    var selected=state.answers[q]===key?' selected':'';
    var viChoice=choiceTextVi(q,key);
    var choiceBody=escapeHtml(choiceText(q,key))+(viChoice?'<span class="vi">'+escapeHtml(viChoice)+'</span>':'');
    answersHtml+='<label class="choice'+selected+'"><input type="radio" name="q'+q+'" value="'+key+'" data-question="'+q+'" data-answer="'+key+'" '+(state.answers[q]===key?'checked':'')+'><span class="choice-letter">'+key+'</span><span class="choice-text">'+choiceBody+'</span></label>';
  }
  var qVi=questionTextVi(q);
  var promptHtml=escapeHtml(questionText(q))+(qVi?'<span class="vi">'+escapeHtml(qVi)+'</span>':'');
  document.getElementById('content').innerHTML=
    '<div class="question-head"><div><div class="part-label">Question</div><div class="qno">'+q+'</div></div><div class="part-label">'+part.title+'</div></div>'+
    media+
    '<div class="prompt">'+promptHtml+'</div>'+
    '<div class="answers">'+answersHtml+'</div>';
  syncNavigator();
}
function syncNavigator(){
  var answered=0;
  for(var i=1;i<=100;i++){
    var btn=document.getElementById('qbtn'+i);
    var has=!!state.answers[i];
    if(has) answered++;
    btn.classList.toggle('answered',has);
    btn.classList.toggle('current',i===state.current);
    btn.classList.toggle('flagged',!!state.flags[i]);
  }
  document.getElementById('answeredCount').textContent=answered+' / 100';
  document.getElementById('footerHint').textContent='Question '+state.current+' of 100 · Answered '+answered+' / 100';
}
function selectAnswer(q,key){
  state.answers[q]=key;
  var labels=document.querySelectorAll('.choice');
  for(var i=0;i<labels.length;i++){
    labels[i].classList.remove('selected');
    var input=labels[i].querySelector('input[type="radio"]');
    if(input&&input.dataset.answer===key){
      input.checked=true;
      labels[i].classList.add('selected');
    }
  }
  syncNavigator();
}
function goQuestion(q){state.current=Math.max(1,Math.min(100,q));renderQuestion();}
function nextQuestion(){goQuestion(state.current+1);}
function previousQuestion(){goQuestion(state.current-1);}
function toggleFlag(){state.flags[state.current]=!state.flags[state.current];syncNavigator();}
function startTest(){
  var audio=document.getElementById('testAudio');
  var status=document.getElementById('startStatus');
  status.textContent='Starting audio...';
  audio.play().then(function(){
    state.started=true;
    document.getElementById('startOverlay').style.display='none';
    document.getElementById('audioStatus').textContent='Audio playing';
    document.getElementById('audioPulse').classList.add('playing');
    state.timerId=setInterval(tick,1000);
  }).catch(function(){
    status.textContent='Không phát được audio. Kiểm tra file '+LISTENING_CONFIG.audioSrc+' hoặc quyền autoplay của trình duyệt.';
    status.className='submit-status err';
  });
}
function tick(){
  if(state.remaining>0) state.remaining--;
  updateTimer();
  if(state.remaining<=0){
    clearInterval(state.timerId);
    openSubmitModal();
  }
}
function updateTimer(){
  var m=Math.floor(state.remaining/60);
  var s=state.remaining%60;
  document.getElementById('timerText').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function openSubmitModal(){
  var answered=Object.keys(state.answers).length;
  document.getElementById('submitSummary').textContent='You have answered '+answered+' / 100 questions.';
  document.getElementById('submitModal').classList.add('show');
}
function closeSubmitModal(){document.getElementById('submitModal').classList.remove('show');}
function requestGoHome(){
  if(state.submitted){location.href='index.html';return;}
  document.getElementById('homeModal').classList.add('show');
}
function closeHomeModal(){document.getElementById('homeModal').classList.remove('show');}
function collectResultPayload(){
  var student=getStudentSession()||{};
  var score=0;
  var answers=[];
  for(var i=0;i<100;i++){
    var no=i+1;
    var selected=state.answers[no]||null;
    var correctAnswer=LISTENING_CONFIG.answerKey[i]||null;
    var isCorrect=!!selected&&!!correctAnswer&&selected===correctAnswer;
    if(isCorrect) score++;
    answers.push({no:no,id:'q'+no,part:getPart(no).no,selected:selected,correctAnswer:correctAnswer,isCorrect:isCorrect,flagged:!!state.flags[no]});
  }
  return {
    student:{email:student.email||'',loginAt:student.loginAt||''},
    quiz:{id:LISTENING_CONFIG.id,title:LISTENING_CONFIG.title,total:100,audioSrc:LISTENING_CONFIG.audioSrc},
    submittedAt:new Date().toISOString(),
    score,total:100,percent:Math.round(score),answers
  };
}
function submitFinalResult(){
  if(state.submitted) return;
  var student=requireStudentSession();
  if(!student) return;
  var statusEl=document.getElementById('submitStatus');
  var payload=collectResultPayload();
  statusEl.className='submit-status';
  statusEl.textContent='Đang lưu kết quả...';
  fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  .then(function(res){
    return res.json().catch(function(){return {};}).then(function(data){
      if(!res.ok||!data.ok) throw new Error(data.error||'Không lưu được kết quả');
      return data;
    });
  })
  .then(function(data){
    state.submitted=true;
    clearInterval(state.timerId);
    document.getElementById('testAudio').pause();
    statusEl.className='submit-status ok';
    statusEl.textContent='Đã lưu kết quả thành công. Mã bài nộp: '+data.id;
    setTimeout(function(){location.href='index.html';},1200);
  })
  .catch(function(err){
    statusEl.className='submit-status err';
    statusEl.textContent='Không thể lưu lên. Kiểm tra KV binding / mạng rồi thử lại.';
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    a.download='student_result_'+(payload.student.email||'student').replace(/[^a-z0-9._-]/gi,'_')+'_'+Date.now()+'.json';
    a.textContent='Tải JSON kết quả dự phòng';
    a.className='big-btn gray';
    a.style.display='inline-block';
    a.style.marginTop='10px';
    statusEl.insertAdjacentElement('afterend',a);
  });
}
document.getElementById('testAudio').addEventListener('ended',function(){
  document.getElementById('audioStatus').textContent='Audio ended';
  document.getElementById('audioPulse').classList.remove('playing');
});
document.addEventListener('change',function(e){
  if(e.target&&e.target.matches('input[type="radio"][data-question][data-answer]')){
    selectAnswer(Number(e.target.dataset.question),e.target.dataset.answer);
  }
});
window.addEventListener('beforeunload',function(e){
  if(state.started&&!state.submitted){e.preventDefault();e.returnValue='';}
});
buildShell();
