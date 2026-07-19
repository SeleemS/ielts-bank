export function speakingAudioControlLabel({
  disabled = false,
  isLoading = false,
  isPlaying = false,
  context = 'examiner question',
} = {}) {
  if (disabled) return `Examiner audio unavailable: ${context}`;
  if (isLoading) return `Loading ${context}`;
  return `${isPlaying ? 'Pause' : 'Play'} ${context}`;
}

export function speakingQuestionAudioContext(index, questionText) {
  return `examiner question ${index + 1}: ${questionText}`;
}
