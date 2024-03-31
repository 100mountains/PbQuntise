/ pbQuntise 1.2

var UserScale = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [7, 3, 12, 7, 3, 19], // chromatic
    [0, 7, 3],
    [0, 4, 1, 5, 4, 7, 5, 11, 7],
    [0, 4, 2, 5, 4, 7, 5, 9, 7, 11],
    [0, 6, 2, 4, 10, 8, 4, 6, 10],
    [0, 48, 0, 48, 0, 12, 24, 48, 0, 48],
    [0, 7]
];

//---global variables-----

NeedsTimingInfo = true; // for LFO / quantise

// others
var MODE = 0; // 0=static 1=relative
var PB_RANGE_UP = 48; // initial value
var PB_RANGE_DOWN = 48; // initial value needed? 
var chromatic_step_down = 8192 / (PB_RANGE_DOWN); // initial value needed? 
var chromatic_step_up = 8191 / (PB_RANGE_UP)
var current_preset = 1;
var last_note = 60;
var last_bend = 0;
var QUANTISE = 0; // 0=off 1=on salty balls
var QVALUE = 0; // chocolate 
var quantized_scale; // the var with the 14 bit PB values in - calculated every time the user changes the note or GUI 
var ScalePreset = []; // expanded currently selected 12 step scale in current key
var scaleMap = []; // 16384 value array for smooth mapping - prolly not needed 
var scaleRelativeBuffer = []; // relative mode tweak
var xpand = 0; // expand scale to pb range 
var qvalues = [32, 16, 11, 8, 9, 4, 6, 2, 3, 1, 0.75, 0.5, 0.33, 0.25];
var stepsUp = 0;
var stepsDown = 0;
var steprangevalueup = 0;
var steprangevaluedown = 0;
var reseton = 0;
var resettype = 0;
var CurrentScaletype = 0; // 0 = scale, 1 = chord, 2 = user scale
var userscalenum = 0;
var timer = 0;
var time = 0;
var timerRunning = 0; // 0 off 1 on
var resetdelay = 0;
var POWER = 1;
var scalecalclen = 0; // num of elements in calculated scale
var zeropoint = 0; // middle point of calculated scale
var nozeropoint = 0;
var key = 0;
var firstrun = 0;
var Smoothing = 0;

//---update scale upon menu change-------------------------------------------------------------------
function update_scale(scaleArray) {
  // Depending on the 'xpand' flag, either expand the scale or filter it.
  let processedScale = xpand === 1 ? expand_scalehi(scaleArray) : scaleArray.filter(note => note <= PB_RANGE_UP);

  // Calculate 'stepsUp' and 'steprangevalueup' if scale is not expanded.
  if (xpand !== 1) {
    stepsUp = processedScale.length - 1;
    steprangevalueup = 8191 / stepsUp;
  }

  // Always mirror the scale to include negative pitch bend values.
  ScalePreset = mirror_negative_scale(processedScale);

  // If MODE is set to 1, update 'scaleRelativeBuffer' to the current 'ScalePreset'.
  if (MODE === 1) {
    scaleRelativeBuffer = ScalePreset;
  }
}

function calc_14bit() {

      // Map scale intervals to 14-bit bend values
  //var chromatic_step = 16384 / PB_RANGE;
  
  quantized_scale = ScalePreset.map(interval => {
    if (interval > 0) {
      return Math.round(interval * chromatic_step_up);
    }
    return Math.round(interval * chromatic_step_down); 
  });
  // Set scale middle point
  zeropoint = quantized_scale.findIndex(value => value >= 0);
  return;

}


function setzeropoint() {
  const scaleLength = quantized_scale.length;
  
  // Find zero point
  zeropoint = quantized_scale.findIndex(note => note >= 0);
  stepsDown = zeropoint;
  stepsUp = scaleLength - zeropoint - 1;

  steprangevalueup = 8191 / stepsUp;
  steprangevaluedown = 8192 / stepsDown;
}


function expand_scalehi(array) {
    const scaleMax = findmax(array) + 1;
    const startOctave = Math.ceil(scaleMax / 12);
    const octaveRange = startOctave * 12;
    let scaleExpandHi = array.filter(val => val <= PB_RANGE_UP);
    let currentOctave = 0;

    while ((currentOctave * 12) + octaveRange <= PB_RANGE_UP) {
        scaleExpandHi = scaleExpandHi.concat(
            array.map(val => val + (currentOctave * 12) + octaveRange).filter(val => val <= PB_RANGE_UP)
        );
        currentOctave++;
    }

    const stepsUp = scaleExpandHi.length - 1;
    if (PB_RANGE_UP === 48 && scaleExpandHi[stepsUp] !== 48 && scaleExpandHi[0] === 0) {
        scaleExpandHi.push(48);
    }

    steprangevalueup = 8191 / stepsUp;
    return scaleExpandHi;
}


function mirror_negative_scale(array) {
    const startOctave = Math.ceil(findmax(array) / 12);
    const arrayOctaveRange = PB_RANGE_UP < 12 ? 12 : startOctave * 12;
    let scaleExpandLow = array.map(val => val - arrayOctaveRange)
                              .filter(val => val >= -Math.abs(PB_RANGE_DOWN));

    if (scaleExpandLow[scaleExpandLow.length - 1] === 0) {
        scaleExpandLow.pop();
    }

    steprangevaluedown = 8192 / scaleExpandLow.length;
    return scaleExpandLow.concat(array);
}


function shiftScale(eventpitch) {
  if (!eventpitch) return; // if eventpitch is falsy, exit the function

  const largest = findmax(scaleRelativeBuffer);
  const startcurrentOctave = Math.ceil(largest / 12);
  const arrayOctaveRange = startcurrentOctave * 12;
  const diff = (60 - eventpitch) % 12; // 60 as the base key, can be adjusted if needed

  let shifted_scale = scaleRelativeBuffer.map(note => note + diff);
  const shiftcalc = arrayOctaveRange * 2;

  // Filter notes that are within the pitch bend range after shifting
  shifted_scale = shifted_scale.filter(note => note >= -Math.abs(PB_RANGE_DOWN) && note <= PB_RANGE_UP);

  // Handle notes out of low range
  const outofrangelo = shifted_scale.filter(note => note < -Math.abs(PB_RANGE_DOWN)).map(note => note + shiftcalc);
  // Handle notes out of high range
  const outofrangehi = shifted_scale.filter(note => note > PB_RANGE_UP).map(note => note - shiftcalc);

  // Combine the filtered notes, ensuring to remove duplicates that might have crossed over the ranges
  const combined_scale = [...new Set([...outofrangelo, ...shifted_scale, ...outofrangehi])].sort((a, b) => a - b);

  ScalePreset = combined_scale;
  calc_14bit(); // Recalculate 14-bit values for the new scale
}

function findmax(array) {
return array.reduce((max, value) => Math.max(max, value));
}

function ResetPitchBend() {
    var PB = new PitchBend; // reset pitchbend
    PB.value = 0; //set the value
    PB.send(); //send the event
    timerRunning = 1; // for a period of time - dont update pb
}




//-----------------------------------------------------------------------------
// HandleMidi main function
//-----------------------------------------------------------------------------

 
function HandleMIDI(event) {
    if (POWER === 0) {
        event.send();
        return;
    }

    var musicInfo = GetTimingInfo();
    var quantization_interval = qvalues[QVALUE];


    if (event instanceof NoteOn) {
        // Handle NoteOn events
        if (reseton === 1 && (resettype === 0 || (resettype === 1 && last_note !== event.pitch))) {
            ResetPitchBend();
        }

        if (MODE === 1 && last_note !== event.pitch) { 
            shiftScale(event.pitch);
        }

        last_note = event.pitch;
        event.send();
    } else if (event instanceof PitchBend) {
        // Quantize PitchBend values
        event.value = snapPb(event.value);
         

        if (musicInfo.playing && QUANTISE === 1) {
            // Calculate the next beat for quantization
            var currentBeat = musicInfo.blockStartBeat;
            var nextQuantizedBeat = Math.ceil(currentBeat * quantization_interval) / quantization_interval;

            // If we're in the middle of a beat, schedule the pitch bend at the next quantized beat
            if (currentBeat < nextQuantizedBeat) {
                event.sendAtBeat(nextQuantizedBeat);
            } else {
                // If the current beat is already quantized, send the event immediately
                event.send();
            }
        } else {
            // If not playing or quantization is off, send the pitch bend event immediately
            event.send();
        }
    } else {
        // Pass all other MIDI events
        event.send();
    }
}



function snapPb(evalue) {
  let low = 0;
  let high = quantized_scale.length - 1;
  let mid;

  while (low <= high) {
    mid = Math.floor((low + high) / 2);
    const currentPbStep = quantized_scale[mid];

    if (evalue < currentPbStep) {
      high = mid - 1;
    } else if (evalue > currentPbStep) {
      low = mid + 1;
    } else {
      break;
    }
  }

  if (low > high) {
    mid = evalue >= 0 ? high : low;
  }

  last_bend = quantized_scale[mid];
  return last_bend;
}


// ProcessMIDI main function
function ProcessMIDI() {
    var info = GetTimingInfo();
    var notesOffSent;

    // Increment timer if it's running
    if (timerRunning) {
        timer++;
        // Reset pitch bend and timer when the set delay is reached
        if (timer >= resetdelay) {
            ResetPitchBend(); // Assuming this function sends a pitch bend reset message
            timer = 0;
            timerRunning = false;
        }
    }

    // When the transport stops, ensure 'all notes off' is sent once
    if (!info.playing && !notesOffSent) {
        //AllNotesOff(); // Assuming this function sends an 'all notes off' message
        notesOffSent = true;
    }

    // When the transport starts, reset the flag to allow 'all notes off' to be sent again if stopped
    if (info.playing && notesOffSent) {
        notesOffSent = false;
    }
}

function getClosest(number, array) {
    return array.reduce((prev, curr) => 
        (Math.abs(curr - number) < Math.abs(prev - number) ? curr : prev)
    );
}


//------GUI update-----------------------------------------------------------------------

function ParameterChanged(param, value) {

    switch (param) {
        case (0):

        case (1):
            PB_RANGE_UP = value;
            chromatic_step_up = 8191 / (PB_RANGE_UP);
            if (CurrentScaletype == 1)
                update_scale(UserScale[userscalenum]);
            else
                update_scale(RawScale[current_preset]);
            calc_14bit()
            break; // default values ? 
        case (2):
            PB_RANGE_DOWN = value;
            chromatic_step_down = 8192 / (PB_RANGE_DOWN);
            if (CurrentScaletype == 1)
                update_scale(UserScale[userscalenum]);
            else
                update_scale(RawScale[current_preset]);
            calc_14bit()
            break;
        case (3):
            current_preset = value;
            CurrentScaletype = 0;
            last_note = 0;
            update_scale(RawScale[current_preset]);
            calc_14bit()
            break; // scales
        case (4):
            current_preset = value;
            CurrentScaletype = 1;
            last_note = 0;
            update_scale(RawChord[current_preset]);
            calc_14bit()
            break; // chords
        case (5):
            if (firstrun == 0) {
                firstrun = 1;
                break;
            } else {
                current_preset = value;
                CurrentScaletype = 2;
                userscalenum = value;
                last_note = 0;
                update_scale(UserScale[userscalenum]);
                calc_14bit()
                break; // user scales
            }
        case (6):
            if (xpand != value) {
                xpand = value;
                if (CurrentScaletype == 2)
                    update_scale(UserScale[userscalenum]);
                else
                if (CurrentScaletype == 0)
                    update_scale(RawScale[current_preset]);
                else
                    update_scale(RawChord[current_preset]);

                calc_14bit()
            }
            break; // extend scale to pb range
        case (7):
            if (MODE != value) {
                MODE = value;
                if (CurrentScaletype == 2) {
                    update_scale(UserScale[userscalenum]);
                } else {
                    if (CurrentScaletype == 0)
                        update_scale(RawScale[current_preset]);
                    else
                        update_scale(RawChord[current_preset]);
                }
                calc_14bit()
            }
            break; // MODE
        case (8):
            QUANTISE = value;
            break; // meh
        case (9):
            QVALUE = value;
            break; // qvalue
        case (10):
            reseton = value;
            break; // reset on 
        case (11):
            resettype = value;
            break; // reset type
        case (12):
            resetdelay = value;
            break; // chocolate                     
        case (13):
            POWER = value;
            break; // chocolate 
        default:
    }
}

//------%DATA-----------------------------------------------------------------------

var PluginParameters = [{
        name: "PB scale quntise V1.2",
        type: "text",
        defaultValue: 0,
        valueStrings: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "A", "A#", "B"]
    },

    {
        name: "PBrange UP",
        type: "lin",
        unit: "steps",
        minValue: 0,
        maxValue: 48,
        numberOfSteps: 48,
        defaultValue: 48
    },

    {
        name: "PBrange DOWN",
        type: "lin",
        unit: "steps",
        minValue: 0,
        maxValue: 48,
        numberOfSteps: 48,
        defaultValue: 48
    },

    {
        name: "Scale",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["Adonai Malakh (Israel)", "Aeolian", "Aeolian Natural Minor", "Algerian", "Altered Pentatonic", "Alternating TetraMirror", "Auxillary Diminished", "Balinese", "Bartok Scale", "Bhairubahar Thaat (India)", "Bi Yu (China)", "Blues #5", "Blues Diminished", "Blues Enneatonic", "Blues Heptatonic", "Blues Major", "Blues Minor ", "Blues Minor Maj7", "Blues Modified", "Blues Octatonic", "Blues Pentacluster", "Blues PentaCluster 2", "Blues Pentatonic Minor", "Blues Phrygian", "Blues scale III", "C Major add (b5) chord", "C minor (#5) chord", "C minor add b5 chord", "C7 (#6) chord", "C7(b5) chord", "Center-Cluster PentaMirror", "Chaio", "Chromatic Full", "Chromatic Bebop", "Chromatic Diatonic Dorian", "Chromatic Dorian", "Chromatic Dorian Inverse", "Chromatic HeptaMirror", "Chromatic HexaMirror", "Chromatic Hypodorian", "Chromatic Hypodorian Inverse", "Chromatic Hypolydian Inverse", "Chromatic Hypophrygian Inverse", "Chromatic Lydian", "Chromatic Lydian Inverse/Todi bVI", "Chromatic Mixolydian", "Chromatic Mixolydian Inverse", "Chromatic PentaMirror", "Chromatic Permuted Diatonic Dorian", "Chromatic Phrygian", "Chromatic Phrygian Inverse", "Chromatic TetraMirror", "Chromatic TriMirror", "Dim 7", "dim7", "Dominant Bebop", "Dominant Pentatonic", "Dorian", "Dorian Aeolian", "Dorian b5", "Dorian Pentatonic", "Double-Phrygian Hexatonic", "Egyptian", "Enigmatic Minor", "Equal temperaments 3 and 4 mixed", "Eskimo Hexatonic 2 (North America)", "Eskimo Tetratonic", "Example Of Pelog", "Full Minor", "Genus Chromaticum", "Genus Primum Inverse", "Genus Secundum", "Gipsy Hexatonic/Raga Kalakanti", "Gregorian Scale 7", "Gypsy Hexatonic", "Half Diminished plus b8", "Half-Dimiished Bebop", "Hamel", "Han - kumoi (Japan)", "Harmonic Major 2/Ionian #5", "Harmonic Major/Ethiopian/Nat Bhairava", "Harmonic Minor", "Harmonic Minor Inverse or Bhairav", "Harmonic Minor Tetrachord", "Harmonic Neapolitan Minor", "Hawaiian", "Hira-joshi Japan", "Honchoshi Plagal Form Japan", "Houseini (Greece)", "Houzam (Greece)", "Hungarian Folk", "Hungarian Gypsy", "Hungarian Major", "Hungarian Major Inverse", "Hungarian Minor", "Hungarian Minor b2", "Hungarian Minor inverse", "Indian/Phrygian dim 4th", "Ionian Pentatonic Raga Gambhiranata (India)", "Ionian/Major/Bilaval C to B asc. nats.", "Istrian (Croatia)", "Iwato Japan", "Japanese Pentachord", "Japanese/Sakura Pentatonic Soft Descend", "Javanese Pentachord", "Jazz Minor/Hawaiian", "Jazz Minor Inverse. Javanese", "Jeths mode", "JG Octatonic", "Kiourdi (Greece)", "Kokin-Joshi/Soft Ascend Japan", "Kung China", "Leading Whole Tone inverse", "Leading Whole-Tone", "Locrian - B to A Ascending naturals", "Locrian 2", "Locrian bb7", "Locrian Natural Maj 6/Pseudo Turkish", "Locrian PentaMirror", "Locrian Pentatonic 2", "Lydian #2", "Lydian #2 Hexatonic", "Lydian Augmented", "Lydian Augmented", "Lydian b3", "Lydian Diminished", "Lydian Dominant + natural seventh", "Lydian Hexatonic", "Lydian Mixolydian Taishikicho/Ryo (Japan)", "Lydian Pentachord", "Lydian/Kalyan F to E ascending naturals", "Magen Abot (Israel)", "Major and Minor mixed", "Major Augmented", "Major Bebop", "Major Bebop Hexatonic", "Major Dominant b7 Chord e.g. Ab7", "Major Locrian", "Major Lydian", "Major Pentachord", "Major Pentatonic", "Major Suspended 4th Chord", "Major Tetrachord", "Maqam Hijaz", "Maqam Shadd araban", "Maqam Tarzanuyn", "Marva Thaat (India)", "Mela Bhavapriya (India)", "Mela Citrambari (India)", "Mela Dhatudhani (India)", "Mela Dhavalambari (India)", "Mela Divamani (India)", "Mela Ganamurti (India)", "Mela Ganamurti (India)", "Mela Gangeyabhusani (India)", "Mela Gavambohdi (India)", "Mela Hatakambari (India)", "Mela Jalarnava (India)", "Mela Jhalaali (India)", "Mela Jhankaradhvani (India)", "Mela Jhotisupini (India)", "Mela Kantamani (India)", "Mela Latangi (India)", "Mela Latangi (India)", "Mela Manavati (India)", "Mela Nagananadini (India)", "Mela Namanararayani (India)", "Mela Navanitam (India)", "Mela Nitimati (India)", "Mela Pavani (India)", "Mela Ragadhani (India)", "Mela Raghupriya (India)", "Mela Rasikapriya (India)", "Mela Ratnangi (India)", "Mela Rupavati (India)", "Mela Salaga (India)", "Mela Senavati (India)", "Mela Sucaritra (India)", "Mela Sunangi", "Mela Syamalangi (India)", "Mela Tanarupi (India)", "Mela Vanaspati (India)", "Mela Varunapriya (India)", "Mela Visvambhari (India)", "Mela Yagapriya (India)", "Minor 6th Added Sixth Pentatonic", "Minor Bebop", "Minor Bebop", "Minor Gypsy", "Minor Hexatonic", "Minor Locrian/Hindi 3 flats and bV", "Minor Major Seventh", "Minor Pentachord Chad Gadyo (Israel)", "Minor Pentatonic", "Minor sus 4", "Mixolydian Augmented", "Mixolydian b5", "Mixolydian Hexatonic", "Moorish Phrygian", "Neapolitan Major and Minor mixed", "Neapolitan Major/Lydian Major", "Neapolitan Minor Mode", "Neveseri (Greece)", "Nohkan (Japan)", "Oriental 2", "Oriental Pentacluster", "Oriental Raga Guhamanohari (India)", "Pan Diminished Blues", "Pan Lydian", "Phrygian", "Phrygian Aeolian", "Phrygian Hexatonic", "Phrygian Locrian", "Phrygian Major/Flamenco/Spanish Phrygian", "Phrygian Tetrachord", "Prokofiev", "Prometheus", "Prometheus Neapolitan", "Pyramid Hexatonic", "Raga Abhogi", "Raga Amarasenapriya (India)", "Raga Audva Tukhari (India)", "Raga Bagesri/Sriranjani/Kapijingla (India)", "Raga Bauli (India)", "Raga Bhanumanjari (India)", "Raga Bhatiyar (India)", "Raga Bhavani (India)", "Raga Bhavani (India)", "Raga Bhinna Pancama (India)", "Raga Bhinna Shadja/Hindolita (India)", "Raga Bhupeshwari/Janasammodini (India)", "Raga Caturangini (India)", "Raga Chandrajyoti (India)", "Raga Chandrakauns Kafi/Surya (India)", "Raga Chandrakauns Kiravani (India)", "Raga Chandrakauns Modern (India)", "Raga Chhaya Todi (India)", "Raga Chitthakarshini (India)", "Raga Cintamani (India)", "Raga Desh", "Raga Deshgaur (India)", "Raga Deanjani (India)", "Raga Dhavalangam (India)", "Raga Dhavalashri (India)", "Raga Dhunibinnashadjam (India)", "Raga Dipak (India)", "Raga Gandharavam", "Raga Gaula (India)", "Raga Gauri (India)", "Raga Ghantana (India)", "Raga Gujari Todi (India)", "Raga Hamsa Vinodini (India)", "Raga Hamsadhvani (India)", "Raga Hamsanandi/Puriya (India)", "Raga Harikauns (India)", "Raga Haripriya (India)", "Raga Hejjajji (India)", "Raga Hindol (India)", "Raga Indupriya (India)", "Raga Jaganmohanam (India)", "Raga Jayakauns (india)", "Raga Jivantika (India)", "Raga Jivantini/Gaurikriya (India)", "Raga Jyoti (India)", "Raga Kalagada", "Raga Kalakanthi (India)", "Raga Kalavati/Ragamalini (India)", "Raga Kamalamanohari (India)", "Raga Kashyapi (India)", "Raga Khamaji Durga (India)", "Raga Khamas/Baduhari (India)", "Raga Kokil Pancham (India)", "Raga Kshanika (India)", "Raga Kumarapriya (India)", "Raga Kumurdaki (India)", "Raga Kuntali (Kuntalaali)", "Raga Latika", "Raga Lavangi(India)", "Raga Madhakauns (India)", "Raga Madhuri", "Raga Mahathi (India)", "Raga Malahari (India)", "Raga Malarani (India)", "Raga Malashri (India) and Chinese", "Raga Malayamarutam (India)", "Raga Malkauns", "Raga Mamata (India) Major 6th", "Raga Manaranjani (India)", "Raga Manavi (India)", "Raga Mandari/Gamakakriya (India)", "Raga Manohari (India)", "Raga Matha Kokila (India)", "Raga Megh (India)", "Raga Megharanjani (India)", "Raga Megharanji (India)", "Raga Mian Ki Malhar/Bahar (India)", "Raga Mohanangi (India)", "Raga Mrunganandana (India)", "Raga Multani (India)", "Raga Nabhomani (India)", "Raga Nagagandhari (India)", "Raga Nagasavali Raga Mand (India)", "Raga Nalinakanti/Kedaram (India)", "Raga Nata/Madhuranjani (India)", "Raga Navamanohari (India)", "Raga Neelangi (India)", "Raga Neroshta", "Raga Nigamagamini (India)", "Raga Nishadi (India)", "Raga Ongkari (India)", "Raga Padi (India)", "Raga Pahadi (India)", "Raga Paraju Simhavahini India", "Raga Phenadyuti (India)", "Raga Priyadharshini (India)", "Raga Puruhutika/Purvaholika (India)", "Raga Putrika (India)", "Raga Rageshri/Nattaikurinji (India)", "Raga Ragesri (India)", "Raga Ramdasi Malhar (India)", "Raga Ramkali (India)", "Raga Ranjani/Rangini (India)", "Raga Rasamanjari (India)", "Raga Rasavali (India)", "Raga Rasika Ranjani (India)", "Raga Rasranjani (India)", "Raga Reva/Revagupti (India)", "Raga Rudra Pancama (India)", "Raga Rukmangi/Pelog2", "Raga Salagaali (India)", "Raga Samudhra Priya (India)", "Raga Sarasanana (India)", "Raga Sarasvati (India)", "Raga Saravati (India)", "Raga Sarsi (India)", "Raga Saugandhini/Yashranjani (India)", "Raga Saurashtra (India)", "Raga Savethri", "Raga Shailaja (India)", "Raga Shri Kalyan", "Raga Shubrani (India)", "Raga Simantini (India)", "Raga Simharava (India)", "Raga Sindhura Kafi (India)", "Raga Sindi Bhairavi (India)", "Raga Siva Kambhoji/Vidhini (India)", "Raga Sohini (India)", "Raga Sorati (India)", "Raga Sthaajam (India)", "Raga Sthaajam Tivravahini (India)", "Raga Suddha Bangala (India)", "Raga Suddha Mukhari (India)", "Raga Sumukam (India)", "Raga Syamalam (India)", "Raga Takka (India)", "Raga Tarangini (India)", "Raga Tilang/Savitri (India)", "Raga Trimurti", "Raga Vaijayanti (India)", "Raga Valaji (India)", "Raga Vasanta/Chayavati (India)", "Raga Vasantabhairavi", "Raga Vijayanagari", "Raga Vijayasri (India)", "Raga Vijayavasanta (India)", "Raga Viyogaali", "Raga Vutari (India)", "Raga Yamuna Kalyani", "Raga Zilaf (India)", "Ritsu Japan/Raga Suddha Todi", "Ritusen Japan/Scottish Pentatonic", "Rock n Roll", "Romanian Bacovia", "Romanian Major", "Romanian/Gnossiennes", "Sabach (Greece)", "Sanagari (Japan)", "Scottish Hexatonic", "Shostakovich", "Spanish 8 tones", "Spanish Folk", "Spanish Heptatonic", "Spanish Pentacluster", "Stravinski", "Super-Locrian Hexamirror", "Symmetrical Decatonic", "Symmetrical Nonatonic", "Takemitsu Tree Line Mode 1", "Takemitsu Tree Line Mode 2", "Ultra Locrian", "Ute Tritone (North America)", "Utility minor", "Verdi s Enigmatic Ascending", "Verdi s Enigmatic Descending", "Verdi:s Enigmatic", "Warao Minor Trichord", "Whole tone alternate", "Whole-Tone", "Whole-Tone Tetramirror", "Youlan -China", "Youlan (China) 2# 4# 7b", "Zirafkend (Arabia)", "No Scale"]
    }, {
        name: "Chord",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["maj7#5", "maj7#5[9]", "maj7", "maj7[#11]", "maj7[13]", "maj7[9]", "maj7[9|13]", "maj7ᵇ5", "major", "major-sus4", "major-ᵇ5", "major6", "major6[9]", "major7", "major7-sus4", "major7[#9]", "major7[#9|13]", "major7[#9|ᵇ13]", "major7[13]", "major7[9]", "major7[9|#11]", "major7[9|#11|13]", "major7[9|13]", "major7[ᵇ13]", "major7[ᵇ9]", "major7[ᵇ9|13]", "major7[ᵇ9|ᵇ13]", "majorAdd2(muvar chord)", "majorAdd9", "majoraug", "majoraug7", "majordim7", "min_maj7", "min_maj7[9]", "minor", "minor6", "minor6[9]", "minor7", "minor7[9]", "minor7[9|11]", "minor7ᵇ5", "minorAdd9", "minordim", "| Dream var chord |", "| Elektra var chord |", "| Farben var chord |", "| Hendrix var chord |", "| Lydian var chord |", "| Magic var chord |", "| Mystic var chord |", "| Neapolitan var chord |", "| Ode-to-Napoleon Hexavar chord |", "| Petruschka var chord |", "| So What var chord |", "| Tristan var chord |", "| Vienesse tri-var chord v.1 |", "| Vienesse tri-var chord v.2 |", "mu 1/2/3/5"]
    }, {
        name: "User Scale",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["User Scale 1", "User Scale 2", "User Scale 3", "User Scale 4", "User Scale 5", "User Scale 6", "User Scale 7", "User Scale 8"]
    },

    {
        name: "Extend Scale to PBrange",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["nope", "uh huh"]
    }, {
        name: "Mode",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["Static", "Relative"]
    },

    {
        name: "Quantise",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["OFF", "ON"]
    },

    {
        name: "Q Value",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["1/128", "1/64", "1/32T", "1/32", "1/16T", "1/16", "1/8T", "1/8", "1/4T", "1/4", "1/2T", "1/2", "1/1T", "1/1"]
    }, {
        name: "PB Reset",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["OFF", "ON"]
    },
    {
        name: "Reset Type",
        type: "menu",
        defaultValue: 0,
        valueStrings: ["every note", "note change"]
    },
    {
        name: "Reset Delay",
        type: "lin",
        unit: " ticks",
        minValue: 0,
        maxValue: 127,
        numberOfSteps: 127,
        defaultValue: 48
    },
 {
        name: "UNiT ON/OFF",
        type: "menu",
        defaultValue: 1,
        valueStrings: ["OFF", "ON"]
    }

];

//---PRESETS-------------------------------------------------------------------


const RawChord = [
    [0, 4, 8, 11],
    [0, 4, 8, 11, 14],
    [0, 4, 7, 11],
    [0, 4, 7, 11, 14, 18],
    [0, 4, 7, 11, 21],
    [0, 4, 7, 11, 14],
    [0, 4, 7, 11, 14, 21],
    [0, 4, 6, 10],
    [0, 4, 7],
    [0, 5, 7],
    [0, 4, 6],
    [0, 4, 7, 9],
    [0, 4, 7, 9, 14],
    [0, 4, 7, 10],
    [0, 5, 7, 10],
    [0, 4, 7, 10, 17],
    [0, 4, 7, 10, 17, 21],
    [0, 4, 7, 10, 17, 20],
    [0, 4, 7, 10, 21],
    [0, 4, 7, 10, 14],
    [0, 4, 7, 10, 14, 18],
    [0, 4, 7, 10, 14, 18, 21],
    [0, 4, 7, 10, 14, 21],
    [0, 4, 7, 10, 20],
    [0, 4, 7, 10, 12],
    [0, 4, 7, 10, 12, 21],
    [0, 4, 7, 10, 12, 20],
    [0, 2, 4, 7],
    [0, 4, 7, 14],
    [0, 4, 8],
    [0, 4, 8, 10],
    [0, 3, 6, 9],
    [0, 3, 7, 11],
    [0, 3, 7, 11, 14],
    [0, 3, 7],
    [0, 3, 7, 9],
    [0, 3, 7, 9, 14],
    [0, 3, 7, 10],
    [0, 3, 7, 10, 14],
    [0, 3, 7, 10, 14, 17],
    [0, 3, 6, 10],
    [0, 3, 7, 14],
    [0, 3, 6],
    [0, 5, 6, 7],
    [0, 7, 9, 14],
    [0, 8, 11, 16, 21],
    [0, 4, 7, 10, 15],
    [0, 4, 7, 11, 18],
    [0, 1, 5, 6, 10, 12, 15, 17],
    [0, 6, 10, 16, 21, 26],
    [1, 5, 8],
    [0, 1, 4, 5, 8, 9],
    [0, 1, 4, 5, 8, 9],
    [0, 5, 10, 15, 19],
    [0, 3, 6, 10],
    [0, 1, 6],
    [0, 6, 7],
    [0, 2, 4, 7]
];


const RawScale = [
    [0, 1, 2, 3, 5, 7, 9, 10],
    [0, 3, 4, 6, 8, 9, 11],
    [0, 2, 3, 5, 7, 8, 10],
    [0, 2, 3, 5, 6, 7, 8, 11],
    [0, 1, 5, 7, 9],
    [0, 1, 3, 4],
    [0, 2, 3, 5, 6, 8, 9, 11],
    [0, 1, 2, 4, 8, 9],
    [0, 2, 4, 6, 7, 9, 10],
    [0, 1, 4, 5, 7, 9, 11],
    [0, 3, 7, 10],
    [0, 3, 5, 6, 11],
    [0, 1, 3, 4, 6, 7, 9, 10],
    [0, 2, 3, 4, 5, 6, 7, 9, 10],
    [0, 3, 5, 6, 7, 9, 10],
    [0, 2, 3, 4, 7, 9],
    [0, 3, 5, 6, 7, 10],
    [0, 3, 5, 6, 7, 11],
    [0, 2, 3, 5, 6, 7, 10],
    [0, 2, 3, 5, 6, 7, 9, 10],
    [0, 1, 2, 3, 6],
    [0, 1, 2, 3, 5],
    [0, 3, 5, 7, 10],
    [0, 1, 3, 5, 6, 7, 10],
    [0, 3, 5, 6, 7, 10, 11],
    [0, 4, 6, 7],
    [0, 3, 7, 8],
    [0, 3, 6, 7],
    [0, 4, 7, 8, 10],
    [0, 4, 6, 7, 10],
    [0, 3, 4, 5, 8],
    [0, 2, 5, 8, 10],
    [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 1, 2, 4, 5, 7, 9, 10, 11],
    [0, 1, 2, 3, 5, 7, 8, 9, 10],
    [0, 1, 2, 5, 7, 8, 9],
    [0, 3, 4, 5, 7, 10, 11],
    [0, 1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 4, 5],
    [0, 2, 3, 4, 7, 8, 9],
    [0, 3, 4, 5, 8, 9, 10],
    [0, 1, 4, 5, 6, 8, 11],
    [0, 1, 2, 5, 6, 7, 9],
    [0, 1, 4, 5, 6, 9, 11],
    [0, 1, 3, 6, 7, 8, 11],
    [0, 1, 2, 4, 6, 7, 10],
    [0, 2, 5, 6, 7, 10, 11],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 4, 5, 7, 8, 9, 11],
    [0, 3, 4, 5, 8, 10, 11],
    [0, 1, 2, 4, 7, 8, 9],
    [0, 1, 2, 3],
    [0, 1, 2],
    [0, 3, 6, 9],
    [0, 3, 6, 9, 10],
    [0, 2, 4, 5, 7, 9, 10, 11],
    [0, 2, 4, 7, 10],
    [0, 2, 3, 5, 7, 9, 10],
    [0, 2, 3, 5, 7, 8, 9, 10],
    [0, 2, 3, 5, 6, 9, 10],
    [0, 2, 3, 7, 9],
    [0, 1, 3, 5, 6, 9],
    [0, 2, 5, 7, 10],
    [0, 1, 3, 6, 8, 10, 11],
    [0, 3, 4, 6, 8, 9],
    [0, 2, 4, 6, 8, 11],
    [0, 2, 4, 7],
    [0, 2, 4, 6, 7, 8, 11],
    [0, 2, 3, 5, 7, 8, 9, 10, 11],
    [0, 1, 3, 4, 5, 7, 8, 9, 11],
    [0, 5, 7, 10],
    [0, 4, 5, 7, 9, 11],
    [0, 1, 5, 6, 8, 9, 10],
    [0, 2, 4, 5, 7, 9, 10],
    [0, 1, 4, 5, 7, 8, 9],
    [0, 3, 6, 10, 11],
    [0, 1, 3, 5, 6, 7, 8, 11],
    [0, 1, 3, 5, 7, 8, 10, 11],
    [0, 2, 5, 7, 8],
    [0, 2, 4, 5, 8, 9, 11],
    [0, 2, 4, 5, 7, 8, 11],
    [0, 2, 3, 5, 7, 8, 11],
    [0, 1, 4, 5, 7, 9, 10],
    [0, 2, 3, 6],
    [0, 1, 2, 3, 5, 7, 8, 11],
    [0, 2, 3, 7, 9, 11],
    [0, 2, 3, 7, 8],
    [0, 1, 3, 5, 6, 10],
    [0, 2, 3, 4, 5, 7, 8, 9, 10],
    [0, 3, 4, 5, 7, 9, 11],
    [0, 1, 4, 5, 7, 8, 11],
    [0, 2, 3, 6, 7, 8, 10],
    [0, 3, 4, 6, 7, 9, 10],
    [0, 2, 3, 5, 6, 8, 9],
    [0, 2, 3, 6, 7, 8, 11],
    [0, 1, 2, 3, 6, 7, 8, 11],
    [0, 1, 4, 5, 6, 9, 10],
    [0, 1, 3, 4, 7, 8, 10],
    [0, 4, 5, 7, 11],
    [0, 2, 4, 5, 7, 9, 11],
    [0, 1, 3, 4, 6, 7],
    [0, 1, 5, 6, 10],
    [0, 1, 3, 6, 7],
    [0, 1, 5, 7, 8],
    [0, 1, 3, 6, 7],
    [0, 2, 3, 5, 7, 9, 11],
    [0, 1, 3, 5, 7, 9, 10],
    [0, 2, 3, 5, 6, 9, 11],
    [0, 1, 3, 4, 5, 7, 9, 10],
    [0, 2, 3, 5, 6, 7, 8, 9, 10],
    [0, 1, 5, 7, 10],
    [0, 2, 4, 6, 9],
    [0, 1, 2, 4, 6, 8, 10],
    [0, 2, 4, 6, 8, 10, 11],
    [0, 1, 3, 5, 6, 8, 10],
    [0, 2, 3, 5, 6, 8, 11],
    [0, 1, 3, 5, 6, 8, 9],
    [0, 1, 3, 5, 6, 9, 10],
    [0, 1, 3, 5, 6],
    [0, 3, 4, 6, 10],
    [0, 3, 4, 6, 7, 9, 11],
    [0, 3, 4, 7, 9, 11],
    [0, 1, 3, 4, 6, 8, 10],
    [0, 2, 4, 6, 8, 9, 11],
    [0, 2, 3, 4, 6, 7, 9, 11],
    [0, 2, 3, 6, 7, 9, 11],
    [0, 2, 4, 6, 7, 9, 10, 11],
    [0, 2, 4, 7, 9, 11],
    [0, 2, 4, 5, 6, 7, 9, 10, 11],
    [0, 2, 4, 6, 7],
    [0, 2, 4, 6, 7, 9, 11],
    [0, 1, 3, 4, 6, 8, 9, 11],
    [0, 2, 3, 4, 5, 7, 8, 9, 10, 11],
    [0, 3, 4, 7, 8, 11],
    [0, 2, 4, 5, 7, 8, 9, 11],
    [0, 2, 4, 7, 8, 9],
    [0, 3, 6, 8],
    [0, 2, 4, 5, 6, 8, 10],
    [0, 2, 4, 5, 6, 7, 9, 11],
    [0, 2, 4, 5, 7],
    [0, 2, 4, 7, 9],
    [0, 2, 5, 7],
    [0, 2, 4, 5],
    [0, 1, 4, 5, 7, 8, 10, 11],
    [0, 1, 3, 4, 5, 6, 9, 10],
    [0, 1, 3, 4, 5, 6, 7, 8, 9, 10],
    [0, 1, 4, 6, 7, 9, 11],
    [0, 1, 3, 6, 7, 8, 10],
    [0, 2, 4, 6, 7, 10, 11],
    [0, 3, 4, 6, 7, 8, 11],
    [0, 1, 4, 6, 7, 8, 9],
    [0, 1, 3, 6, 7, 10, 11],
    [0, 1, 2, 5, 7, 8, 11],
    [0, 1, 2, 5, 7, 8, 11],
    [0, 3, 4, 5, 7, 8, 11],
    [0, 1, 3, 6, 7, 8, 9],
    [0, 1, 4, 5, 7, 10, 11],
    [0, 1, 2, 6, 7, 8, 10],
    [0, 1, 2, 6, 7, 8, 11],
    [0, 2, 3, 5, 7, 8, 9],
    [0, 3, 4, 6, 7, 8, 10],
    [0, 2, 4, 6, 7, 8, 9],
    [0, 2, 4, 6, 7, 8, 11],
    [0, 2, 4, 6, 7, 8, 11],
    [0, 1, 2, 5, 7, 9, 11],
    [0, 2, 4, 5, 7, 10, 11],
    [0, 1, 4, 6, 7, 8, 10],
    [0, 1, 2, 6, 7, 9, 10],
    [0, 2, 3, 6, 7, 10, 11],
    [0, 1, 2, 6, 7, 9, 11],
    [0, 3, 4, 5, 7, 8, 10],
    [0, 1, 2, 6, 7, 10, 11],
    [0, 3, 4, 6, 7, 10, 11],
    [0, 1, 2, 5, 7, 8, 10],
    [0, 1, 3, 5, 7, 10, 11],
    [0, 1, 2, 6, 7, 8, 9],
    [0, 1, 3, 5, 7, 8, 9],
    [0, 3, 4, 6, 7, 8, 9],
    [1, 2, 4, 7, 8, 10],
    [0, 2, 3, 6, 7, 8, 9],
    [0, 1, 2, 5, 7, 10, 11],
    [0, 1, 2, 5, 7, 9, 10],
    [0, 2, 3, 5, 7, 10, 11],
    [0, 1, 4, 6, 7, 10, 11],
    [0, 3, 4, 5, 7, 8, 9],
    [0, 3, 5, 7, 9],
    [0, 2, 3, 4, 5, 7, 9, 10],
    [0, 2, 3, 4, 7, 9, 10],
    [0, 2, 3, 6, 7, 8, 10, 11],
    [0, 2, 3, 5, 7, 10],
    [0, 2, 3, 5, 6, 8, 10],
    [0, 3, 7, 11],
    [0, 2, 3, 5, 7],
    [0, 2, 3, 4, 5, 6, 7, 9, 10, 11],
    [0, 3, 5, 7],
    [0, 2, 4, 5, 8, 9, 10],
    [0, 2, 4, 5, 6, 9, 10],
    [0, 2, 5, 7, 9, 10],
    [0, 1, 3, 4, 5, 7, 8, 10, 11],
    [0, 1, 3, 5, 7, 8, 9, 11],
    [0, 1, 3, 5, 7, 9, 11],
    [0, 1, 2, 4, 6, 8, 9],
    [0, 1, 3, 6, 7, 8, 10, 11],
    [0, 2, 5, 6, 8, 9, 11],
    [0, 1, 4, 5, 6, 9, 10, 11],
    [0, 1, 2, 5, 6],
    [0, 2, 5, 9, 10],
    [0, 1, 2, 3, 4, 6, 7, 9, 10, 11],
    [0, 2, 3, 4, 5, 6, 7, 8, 9, 11],
    [0, 1, 3, 5, 7, 8, 10],
    [1, 2, 3, 4, 6, 8, 9, 11],
    [0, 3, 5, 7, 8, 10],
    [0, 1, 3, 5, 6, 7, 8, 10],
    [0, 1, 3, 4, 5, 7, 8, 10],
    [0, 1, 3, 5],
    [0, 1, 3, 5, 6, 8, 10, 11],
    [0, 2, 4, 6, 9, 10],
    [0, 1, 4, 6, 9, 10],
    [0, 2, 3, 5, 6, 9],
    [0, 2, 3, 5, 9],
    [0, 2, 3, 6, 7, 11],
    [0, 2, 3, 5, 8],
    [0, 2, 3, 5, 9, 10],
    [0, 1, 4, 7, 8, 11],
    [0, 3, 4, 5, 7, 10],
    [0, 1, 4, 5, 6, 7, 9, 11],
    [0, 2, 5, 9],
    [0, 1, 3, 6, 8, 10],
    [0, 2, 5, 7, 8, 11],
    [0, 4, 5, 9, 11],
    [0, 2, 4, 7, 8],
    [0, 2, 4, 6, 7, 11],
    [0, 1, 2, 6, 7, 9],
    [0, 3, 5, 9, 10],
    [0, 3, 5, 8, 11],
    [0, 3, 5, 9, 11],
    [0, 1, 3, 6, 8],
    [0, 1, 3, 5, 8],
    [0, 2, 3, 6, 7, 8, 9, 10],
    [0, 2, 5, 7, 11],
    [0, 1, 7, 8, 11],
    [0, 5, 7, 8, 11],
    [0, 1, 4, 6, 7, 8],
    [0, 4, 6, 7, 9],
    [0, 1, 3, 5, 7, 8, 11],
    [0, 2, 4, 5, 6, 7],
    [0, 1, 3, 5, 7, 10],
    [0, 1, 4, 5, 7, 11],
    [0, 1, 5, 7, 11],
    [0, 2, 3, 5, 8, 11],
    [0, 1, 3, 6, 8, 11],
    [0, 2, 4, 5, 9, 11],
    [0, 2, 4, 7, 11],
    [0, 1, 4, 6, 9, 11],
    [0, 3, 6, 8, 10],
    [0, 2, 5, 8],
    [0, 1, 4, 6, 8, 9],
    [0, 4, 6, 9, 11],
    [0, 1, 4, 6, 7, 10],
    [0, 2, 6, 7, 8, 10],
    [0, 3, 5, 6, 10],
    [0, 1, 5, 7, 9, 11],
    [0, 3, 6, 7, 10, 11],
    [0, 4, 6, 7, 8, 10],
    [0, 1, 4, 7, 8, 9],
    [0, 1, 5, 7, 8, 9],
    [0, 1, 4, 5, 7, 9],
    [0, 4, 5, 7, 8, 10],
    [0, 1, 3, 7, 8, 10],
    [0, 4, 5, 9, 10],
    [0, 4, 5, 7, 9, 10],
    [0, 3, 5, 7, 8],
    [0, 1, 5, 8, 11],
    [0, 1, 2, 8, 11],
    [0, 2, 4, 6, 11],
    [0, 5, 7, 9, 10],
    [0, 2, 4, 7, 8, 11],
    [0, 1, 5, 8],
    [0, 3, 6, 7, 9, 10],
    [0, 4, 5, 7, 9, 10, 11],
    [0, 4, 7, 10],
    [0, 1, 4, 5, 7, 8],
    [0, 2, 6, 7, 10, 11],
    [0, 4, 6, 7, 11],
    [0, 1, 4, 7, 9, 10],
    [0, 3, 5, 8, 10],
    [0, 4, 7, 9, 11],
    [0, 1, 4, 7, 10],
    [0, 2, 3, 7, 9, 10],
    [0, 1, 4, 6, 7, 11],
    [0, 3, 5, 7, 9, 10],
    [0, 2, 7, 9, 10],
    [0, 2, 5, 7, 10, 11],
    [0, 1, 4, 5, 8],
    [0, 1, 4, 5, 11],
    [0, 2, 3, 5, 7, 9, 10, 11],
    [0, 3, 4, 7, 9],
    [0, 2, 4, 6, 9, 11],
    [0, 3, 6, 7, 11],
    [0, 1, 2, 6, 7],
    [0, 2, 5, 7, 9, 11],
    [0, 4, 5, 7, 9],
    [0, 2, 4, 5, 7, 11],
    [0, 3, 5, 7, 11],
    [0, 2, 5, 7, 8, 10],
    [0, 2, 3, 6, 8, 9],
    [0, 2, 4, 9, 11],
    [0, 4, 6, 11],
    [0, 2, 6, 7, 9, 11],
    [0, 6, 7],
    [0, 1, 5, 7, 8, 11],
    [0, 2, 4, 5, 7, 8, 9, 10, 11],
    [0, 4, 5, 7, 8, 11],
    [0, 1, 5, 7, 8, 10],
    [0, 2, 5, 8, 11],
    [0, 5, 7, 9, 11],
    [0, 1, 2, 8, 9],
    [0, 2, 4, 5, 9, 10],
    [0, 2, 4, 5, 9, 10, 11],
    [0, 2, 3, 4, 5, 7, 9, 10, 11],
    [0, 1, 4, 5, 6, 7, 8, 11],
    [0, 2, 3, 6, 9, 11],
    [0, 3, 4, 6, 7, 11],
    [0, 1, 5, 7, 9, 10],
    [0, 1, 4, 7, 9],
    [0, 2, 5, 9, 11],
    [0, 1, 4, 7, 8],
    [0, 1, 4, 5, 9, 10],
    [0, 1, 3, 7, 10],
    [0, 1, 3, 7, 9, 10],
    [0, 3, 6, 7, 10],
    [0, 2, 4, 5, 8, 11],
    [0, 2, 6, 7, 9, 10],
    [0, 4, 5, 7, 8, 9],
    [0, 5, 7],
    [0, 1, 6, 7, 8],
    [0, 1, 4, 5, 7, 8, 9, 11],
    [0, 4, 5, 7, 10],
    [0, 3, 7, 8, 10],
    [0, 2, 6, 7, 9],
    [0, 2, 6, 9, 11],
    [0, 1, 3, 5, 7, 8],
    [0, 2, 3, 6, 7, 10],
    [0, 2, 3, 5, 7, 11],
    [0, 1, 2, 3, 4, 5, 7, 8, 10, 11],
    [0, 2, 4, 5, 7, 10],
    [0, 1, 4, 5, 8, 11],
    [0, 2, 5, 7, 9, 10, 11],
    [0, 1, 3, 6, 7, 9, 10],
    [0, 1, 3, 6, 7, 9, 10],
    [0, 2, 3, 5, 7, 9],
    [0, 1, 2, 5, 8, 9],
    [0, 2, 6, 11],
    [0, 2, 3, 6, 7, 8],
    [0, 3, 5, 7, 8, 11],
    [0, 2, 4, 5, 7, 8, 10],
    [0, 4, 5, 7, 10, 11],
    [0, 2, 3, 7, 8, 10],
    [0, 2, 6, 7, 11],
    [0, 4, 7, 9, 10],
    [0, 1, 4, 5, 9, 11],
    [0, 1, 4, 5, 8, 10],
    [0, 2, 3, 6, 7, 9],
    [0, 1, 2, 6, 7, 11],
    [0, 4, 6, 7, 10, 11],
    [0, 1, 3, 5, 8, 11],
    [0, 4, 6, 7, 9, 10],
    [0, 2, 4, 6, 7, 9],
    [0, 4, 5, 7, 8],
    [0, 1, 3, 5, 8, 10],
    [0, 2, 5, 7, 9],
    [0, 3, 4, 5, 7, 9, 10],
    [0, 4, 5, 8, 11],
    [0, 1, 4, 6, 7, 9, 10],
    [0, 2, 3, 6, 7, 9, 10],
    [0, 2, 3, 4, 7, 8, 10],
    [0, 5, 10],
    [0, 2, 4, 5, 7, 9],
    [0, 1, 3, 4, 6, 7, 9, 11],
    [0, 1, 3, 4, 5, 6, 8, 10],
    [0, 1, 4, 5, 7, 8, 10],
    [0, 3, 4, 5, 6, 8, 10],
    [0, 1, 3, 4, 5],
    [0, 2, 4, 6, 7, 8, 10],
    [0, 1, 3, 4, 6, 10],
    [0, 1, 2, 4, 5, 6, 7, 8, 10, 11],
    [0, 1, 2, 4, 6, 7, 8, 10, 11],
    [0, 2, 3, 6, 8, 11],
    [0, 2, 3, 6, 8, 10],
    [0, 1, 3, 4, 6, 8, 9],
    [0, 3, 10],
    [0, 2, 3, 5, 7, 8, 10, 11],
    [0, 1, 4, 6, 8, 10, 11],
    [0, 1, 4, 5, 8, 10, 11],
    [0, 1, 4, 5, 6, 8, 10, 11],
    [0, 2, 3, 10],
    [0, 2, 4, 6, 8, 10],
    [0, 2, 4, 6, 8, 10],
    [0, 2, 4, 6],
    [0, 1, 2, 4, 5, 6, 7, 9, 10],
    [0, 1, 2, 4, 5, 6, 7, 9, 10],
    [0, 2, 3, 5, 7, 8, 9, 11],
    []
];