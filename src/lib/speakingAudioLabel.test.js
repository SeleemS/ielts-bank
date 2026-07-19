import { describe, expect, it } from 'vitest';
import {
  speakingAudioControlLabel,
  speakingQuestionAudioContext,
} from './speakingAudioLabel';

describe('speakingAudioControlLabel', () => {
  it('gives each question a unique play name', () => {
    const questions = [
      'What kind of music do you like to listen to?',
      'When do you usually listen to music?',
    ];

    expect(
      questions.map((text, index) =>
        speakingAudioControlLabel({
          context: speakingQuestionAudioContext(index, text),
        })
      )
    ).toEqual([
      'Play examiner question 1: What kind of music do you like to listen to?',
      'Play examiner question 2: When do you usually listen to music?',
    ]);
  });

  it('announces loading, pause, and unavailable states with the same context', () => {
    const context = 'examiner reading the cue card';

    expect(speakingAudioControlLabel({ context, isLoading: true })).toBe(
      'Loading examiner reading the cue card'
    );
    expect(speakingAudioControlLabel({ context, isPlaying: true })).toBe(
      'Pause examiner reading the cue card'
    );
    expect(speakingAudioControlLabel({ context, disabled: true })).toBe(
      'Examiner audio unavailable: examiner reading the cue card'
    );
  });
});
