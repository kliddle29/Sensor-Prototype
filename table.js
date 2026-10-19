// table.js: our State Table, in code, copied row for row from the paper table.
// States come from our field guide, Gaze Lexicography. KL Kenzo, WC Will, TS Tate.
//
// signals: the numbers our sensing writes, each 0 to 1. Three of us, one each.
//   near     KL  how close the nearest person is: 0 at the back of the space,
//                1 at arm's length from the screen
//   still    WC  how little the person has moved over the last second: 0 while
//                walking or gesturing, 1 when holding completely still
//   present  TS  whether anyone is in range at all: 0 for an empty space, 1 for
//                a person clearly there
//
// states: checked top to bottom; the first row whose rule is true wins.
//   hold is in seconds: how long a rule has to stay true before the state changes.
//   nobody is checked first, so a reading left over from someone who just walked
//   off can't fire another row. A reading that falls between rules keeps the
//   piece in its last state, so it never flickers at an edge.
//
// These are the paper table's numbers. Monday's first near and still readings set
// the exact values; a threshold that moves goes in the break log.

window.TABLE = {
  signals: ['near', 'still', 'present'],

  states: [
    // TS. No one there.
    { name: 'nobody',       when: s => s.present < 0.2,                                  hold: 5 },
    // WC. Field guide no. 13.
    { name: 'Performative', when: s => s.near >= 0.2 && s.near <= 0.6 && s.still < 0.4,  hold: 1.5 },
    // WC. Field guide no. 14.
    { name: 'Planted',      when: s => s.near >= 0.2 && s.near <= 0.6 && s.still > 0.75, hold: 3 },
    // KL. Field guide no. 08.
    { name: 'Recursive',    when: s => s.near > 0.6 && s.still > 0.75,                   hold: 4 },
    // KL. Field guide no. 04.
    { name: 'Breached',     when: s => s.near > 0.6 && s.still < 0.3,                    hold: 0.5 },
  ],
};
