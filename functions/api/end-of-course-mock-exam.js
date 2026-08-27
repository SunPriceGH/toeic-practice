const QUIZ_ID = 'end-of-course-mock-exam';
const QUIZ_TITLE = 'Thi thử TOEIC cuối khóa';

const ANSWER_KEY = Object.freeze({
  1:'B',2:'D',3:'B',4:'A',5:'C',6:'A',
  7:'A',8:'B',9:'C',10:'A',11:'C',12:'C',13:'A',14:'A',15:'B',16:'C',17:'A',18:'B',19:'C',20:'C',21:'B',22:'C',23:'A',24:'A',25:'B',26:'B',27:'B',28:'A',29:'B',30:'C',31:'C',
  101:'A',102:'C',103:'A',104:'D',105:'A',106:'D',107:'A',108:'B',109:'B',110:'A',111:'C',112:'B',113:'D',114:'C',115:'B',116:'D',117:'A',118:'B',119:'C',120:'D',121:'A',122:'A',123:'B',124:'A',125:'C',126:'B',127:'B',128:'A',129:'D',130:'C',
  131:'C',132:'D',133:'A',134:'B',135:'D',136:'D',137:'B',138:'A',139:'B',140:'A',141:'B',142:'D',143:'C',144:'C',145:'A',146:'B'
});

const QUESTION_NUMBERS = Object.freeze([
  ...Array.from({length:31},(_,i)=>i+1),
  ...Array.from({length:46},(_,i)=>i+101)
]);

export async function onRequestPost(context) {
  try {
    if (!context.env.STUDENT_RESULTS) {
      return json({ ok:false, error:'Thiếu KV binding STUDENT_RESULTS.' }, 500);
    }

    const body = await context.request.json().catch(() => ({}));
    const email = normalizeEmail(body?.student?.email);
    const token = String(body?.student?.token || context.request.headers.get('x-student-token') || '');

    if (!email || !isStudentTokenForEmail(token, email)) {
      return json({ ok:false, error:'Phiên đăng nhập học viên không hợp lệ.' }, 401);
    }

    const rawAnswers = body && typeof body.answers === 'object' && body.answers ? body.answers : {};
    const answers = [];
    let score = 0;
    const sectionScores = {
      part1:{ score:0, total:6 },
      part2:{ score:0, total:25 },
      part5:{ score:0, total:30 },
      part6:{ score:0, total:16 }
    };

    for (const no of QUESTION_NUMBERS) {
      const selected = normalizeChoice(rawAnswers[String(no)] ?? rawAnswers[no]);
      const correct = ANSWER_KEY[no];
      const isCorrect = selected === correct;
      const part = no <= 6 ? 1 : no <= 31 ? 2 : no <= 130 ? 5 : 6;
      if (isCorrect) {
        score += 1;
        sectionScores[`part${part}`].score += 1;
      }
      answers.push({ no, part, selected });
    }

    const total = QUESTION_NUMBERS.length;
    const percent = Math.round((score / total) * 100);

    const listeningCorrect = sectionScores.part1.score + sectionScores.part2.score;
    const readingCorrect = sectionScores.part5.score + sectionScores.part6.score;
    const toeicEstimate = {
      listening: estimateToeicSection(listeningCorrect, 31),
      reading: estimateToeicSection(readingCorrect, 46),
      total: 0,
      max: 990,
      method: 'percent-correct-linear-rounded-to-5'
    };
    toeicEstimate.total = toeicEstimate.listening + toeicEstimate.reading;

    const submittedAt = new Date().toISOString();
    const safeEmail = email.replace(/[^a-z0-9._-]/gi, '_');
    const id = `${Date.now()}_${safeEmail}`;
    const filename = `student_result/${id}.json`;

    // Intentionally do NOT save or return per-question correctness, correct answers,
    // correct text, or explanations. Only selected choices + aggregate scores are stored.
    const payload = {
      quiz:{
        id:QUIZ_ID,
        title:QUIZ_TITLE,
        total,
        hideAnswerReview:true,
        mode:'mock-exam'
      },
      student:{ email },
      submittedAt,
      score,
      total,
      percent,
      sectionScores,
      toeicEstimate,
      answers
    };

    const record = {
      id,
      filename,
      email,
      submittedAt,
      score,
      total,
      percent,
      payload
    };

    await context.env.STUDENT_RESULTS.put(id, JSON.stringify(record), {
      metadata:{
        email,
        submittedAt,
        score:String(score),
        total:String(total),
        percent:String(percent),
        filename,
        quizId:QUIZ_ID
      }
    });

    return json({
      ok:true,
      id,
      submittedAt,
      score,
      total,
      percent,
      sectionScores,
      toeicEstimate
    });
  } catch (err) {
    return json({ ok:false, error:err?.message || 'Không chấm/lưu được bài thi.' }, 500);
  }
}

function estimateToeicSection(correct, total) {
  const ratio = total > 0 ? correct / total : 0;
  const rounded = Math.round((ratio * 495) / 5) * 5;
  return Math.max(5, Math.min(495, rounded));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeChoice(value) {
  const choice = String(value || '').trim().toUpperCase();
  return /^[ABCD]$/.test(choice) ? choice : '';
}

function isStudentTokenForEmail(token, email) {
  try {
    const decoded = atob(String(token || ''));
    const parts = decoded.split('|');
    const role = String(parts[0] || '').trim().toLowerCase();
    const tokenEmail = normalizeEmail(parts[1]);
    return (role === 'student' || role === 'admin') && tokenEmail === normalizeEmail(email);
  } catch (err) {
    return false;
  }
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{ 'content-type':'application/json; charset=utf-8' }
  });
}
