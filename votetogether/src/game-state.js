export const MAX_QUESTIONS = 50;

export function createInitialState(roomCode) {
  return {
    schemaVersion: 1,
    roomCode,
    revision: 0,
    hostUsername: null,
    currentQuestionIndex: -1,
    questions: [],
    users: {},
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function authenticateUser(state, username, passwordHash) {
  const next = cloneState(state);
  const existing = next.users[username];

  if (existing && existing.passwordHash !== passwordHash) {
    return { state, changed: false, result: "bad_password" };
  }

  if (!existing) {
    next.users[username] = {
      passwordHash,
      pollsVoted: 0,
      guessesCorrect: 0,
    };
    next.revision += 1;
    return { state: next, changed: true, result: "new_user" };
  }

  return { state, changed: false, result: "ok" };
}

export function applyCommand(state, command, context) {
  const username = context?.username;
  if (!username || !state.users[username]) {
    return rejected(state, "You are not authenticated in this room.");
  }

  const next = cloneState(state);

  switch (command?.type) {
    case "claim-host":
      if (next.hostUsername && next.hostUsername !== username) {
        return rejected(state, `${next.hostUsername} is already the host.`);
      }
      next.hostUsername = username;
      return accepted(next);

    case "add-question": {
      if (!isHost(next, username)) return hostOnly(state);
      const text = cleanText(command.text, 180);
      const options = (command.options || [])
        .map((option) => cleanText(option, 80))
        .filter(Boolean)
        .slice(0, 8);
      if (!text || options.length < 2) {
        return rejected(state, "A poll needs a question and at least two options.");
      }

      closeActiveQuestion(next);
      const id = next.questions.length
        ? next.questions[next.questions.length - 1].id + 1
        : 1;
      next.questions.push({ id, text, options, votes: {}, closed: false });
      if (next.questions.length > MAX_QUESTIONS) next.questions.shift();
      next.currentQuestionIndex = next.questions.length - 1;
      return accepted(next);
    }

    case "vote": {
      if (isHost(next, username)) {
        return rejected(state, "The host closes the poll and does not vote.");
      }
      const question = activeQuestion(next);
      if (!question || question.closed) return rejected(state, "There is no open poll.");
      if (question.votes[username]) return rejected(state, "You have already voted.");
      const voteIndex = Number(command.voteIndex);
      const guessIndex = Number(command.guessIndex);
      if (!validOption(question, voteIndex) || !validOption(question, guessIndex)) {
        return rejected(state, "That vote is not valid for this poll.");
      }
      question.votes[username] = { vote: voteIndex, guess: guessIndex };
      return accepted(next);
    }

    case "close-question":
      if (!isHost(next, username)) return hostOnly(state);
      if (!closeActiveQuestion(next)) return rejected(state, "There is no open poll to close.");
      return accepted(next);

    default:
      return rejected(state, "Unknown command.");
  }
}

export function activeQuestion(state) {
  return state.questions[state.currentQuestionIndex] || null;
}

export function voteCounts(question) {
  const counts = question.options.map(() => 0);
  Object.values(question.votes).forEach(({ vote }) => {
    if (validOption(question, vote)) counts[vote] += 1;
  });
  return counts;
}

export function winningIndex(question) {
  const counts = voteCounts(question);
  const maximum = Math.max(0, ...counts);
  const winners = counts
    .map((count, index) => (count === maximum ? index : -1))
    .filter((index) => index >= 0);
  return maximum > 0 && winners.length === 1 ? winners[0] : -1;
}

function closeActiveQuestion(state) {
  const question = activeQuestion(state);
  if (!question || question.closed) return false;
  question.closed = true;
  const winner = winningIndex(question);
  Object.entries(question.votes).forEach(([username, vote]) => {
    const user = state.users[username];
    if (!user) return;
    user.pollsVoted += 1;
    if (winner >= 0 && vote.guess === winner) user.guessesCorrect += 1;
  });
  return true;
}

function accepted(state) {
  state.revision += 1;
  return { state, changed: true, error: null };
}

function rejected(state, error) {
  return { state, changed: false, error };
}

function hostOnly(state) {
  return rejected(state, "Only the host can do that.");
}

function isHost(state, username) {
  return state.hostUsername === username;
}

function cleanText(value, maximumLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

function validOption(question, index) {
  return Number.isInteger(index) && index >= 0 && index < question.options.length;
}
