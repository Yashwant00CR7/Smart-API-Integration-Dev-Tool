/* ============================================================
   Smart API DevTool — Shared Quiz Widget
   Usage: checkAnswer(buttonEl, isCorrect, 'questionId')
   The correct answer is always marked with data-correct="true"
   on the button element.
   ============================================================ */

function checkAnswer(button, isCorrect, questionId) {
  const group = button.closest('.quiz-options');
  const options = group.querySelectorAll('.opt');

  options.forEach(btn => {
    btn.disabled = true;
    btn.classList.remove('correct', 'incorrect');
  });

  if (isCorrect) {
    button.classList.add('correct');
  } else {
    button.classList.add('incorrect');
    // Reveal the correct option
    options.forEach(btn => {
      if (btn.dataset.correct === 'true') btn.classList.add('correct');
    });
  }

  const exp = document.getElementById(questionId + '-exp');
  if (exp) exp.style.display = 'block';
}
