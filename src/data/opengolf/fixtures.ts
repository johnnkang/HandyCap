/**
 * Verbatim excerpts of live OpenGolfAPI responses, captured while building the
 * client. These keep the parser honest about the shapes it actually receives,
 * including the fields that come back null.
 */

export const pebbleBeachSearch = {
  courses: [
    {
      id: '40977ee8-33ee-4195-b6a2-99a4ca83c2bc',
      name: 'Pebble Beach Golf Links',
      course_name: 'Pebble Beach Golf Links',
      latitude: 36.5685,
      longitude: -121.949,
      state: 'CA',
      city: 'Pebble Beach',
      type: 'Resort/Public',
      par: 72,
      phone: '(831) 574-5609',
      website: 'http://pebblebeach.com/golf/pebble-beach-golf-links',
    },
  ],
  total: 25,
  _license: 'ODbL-1.0',
  _attribution:
    '© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI — https://opengolfapi.org/attribution',
}

export const pebbleBeachTees = {
  tees: [
    { tee_key: 'blue-male', tee_name: 'Blue', tee_color: 'blue', gender: 'Male', course_rating: 74.9, slope: 144, par: 72, yardage: 6802 },
    { tee_key: 'gold-male', tee_name: 'Gold', tee_color: 'gold', gender: 'Male', course_rating: 73.4, slope: 137, par: 72, yardage: 6472 },
    { tee_key: 'gold-female', tee_name: 'Gold', tee_color: 'gold', gender: 'Female', course_rating: 78.2, slope: 146, par: 72, yardage: 6472 },
    { tee_key: 'red-female', tee_name: 'Red', tee_color: 'red', gender: 'Female', course_rating: 71.7, slope: 132, par: 72, yardage: 5125 },
  ],
}

export const pebbleBeachHoles = {
  holes: [
    { number: 1, par: 4, handicap_index: 6, yardages: { blue: 378 }, tee_coords: null, green: { center: null }, hazards: [] },
    { number: 2, par: 5, handicap_index: 10, yardages: { blue: 509 }, tee_coords: null, green: { center: null }, hazards: [] },
    { number: 3, par: 4, handicap_index: 12, yardages: { blue: 397 }, tee_coords: null, green: { center: null }, hazards: [] },
    { number: 5, par: 3, handicap_index: 14, yardages: { blue: 189 }, tee_coords: null, green: { center: null }, hazards: [] },
  ],
}

/** A course whose community data is incomplete, which is common in the wild. */
export const patchyCourse = {
  tees: [
    { tee_key: 'white-male', tee_name: 'White', tee_color: 'white', gender: 'Male', course_rating: null, slope: null, par: 72, yardage: 6100 },
    { tee_key: 'blue-male', tee_name: 'Blue', tee_color: 'blue', gender: 'Male', course_rating: 71.2, slope: 126, par: 72, yardage: 6500 },
  ],
  holes: [
    { number: 1, par: 4, handicap_index: null, yardages: {} },
    { number: 2, par: 5, handicap_index: null, yardages: {} },
  ],
}
