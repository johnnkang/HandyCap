/**
 * Every piece of handicap jargon the app shows, in plain English.
 *
 * The rule for writing these: a golfer who has never heard the term should
 * understand the sentence, and a golfer who knows it should not find it wrong.
 */
export const glossary = {
  handicapIndex:
    'Your Handicap Index is a portable measure of your potential: the average of your best 8 rounds out of your last 20, adjusted for how hard each course was. It travels with you to any course.',
  scoreDifferential:
    'A Score Differential is what you shot, rescaled to a standard course. It is how a 78 at a brutal championship course and a 78 at an easy muni get compared fairly.',
  courseRating:
    'Course Rating is the score a scratch golfer is expected to shoot here. If it is higher than par, the course is harder than its par suggests.',
  slope:
    'Slope Rating measures how much harder a course plays for an average golfer than for a scratch golfer. 113 is average; 155 is the maximum.',
  courseHandicap:
    'Your Course Handicap is how many strokes you actually get at this course, from these tees. It is your Index adjusted for this specific test.',
  netDoubleBogey:
    'For handicap purposes, no hole can count for more than double bogey plus any strokes you get on it. One blow-up hole cannot wreck your Index.',
  strokeIndex:
    'Stroke Index ranks the holes from hardest (1) to easiest (18). It decides which holes your handicap strokes land on.',
  lowHandicapIndex:
    'Your Low Handicap Index is the lowest Index you have held in the past year. It anchors the limits on how fast your Index can rise.',
  softCap:
    'Your Index rose more than 3 strokes above your best of the last year, so the increase beyond that point is being halved. It is a brake, not a penalty.',
  hardCap:
    'Your Index has hit its ceiling: it cannot go more than 5 strokes above your best of the last year.',
  exceptionalScore:
    'You played far better than your Index suggested, so the Rules lower it immediately rather than waiting for the averages to catch up.',
  pendingNine:
    'A 9-hole round waits for a second nine, then the two combine into one 18-hole score. Play another nine and both will count.',
  pcc:
    'Playing Conditions Calculation adjusts scores on days when the whole field struggled. It needs every score posted at the course that day, so HandyCap treats it as zero.',
  countingRounds:
    'These are the rounds currently counting toward your Index. The rest of your last 20 are still on record, they just are not among your best.',
} as const

export type GlossaryTerm = keyof typeof glossary
