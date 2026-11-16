### Chapman on Broadway (COB)
#### Sound System Setup & X32 Compact Quick Reference
**Sound engineer · Music director** (students' names removed; this repo is public)

This guide covers the planned setup. **Routing and connections have not yet been tested.** Verify everything before the performance.

### 1. Equipment & Cable Checklist

#### Main Equipment
- ☐ Behringer X32 Compact + power cord
- ☐ Behringer SD8 stage box + power cord
- ☐ Yamaha StagePas 400BT (mixer + 2 speakers)
- ☐ Powered Behringer/Mackie stage monitors
- ☐ 12 microphones + stands/clips
- ☐ Laptop for playback
- ☐ 2 speaker stands for main PA

#### Audio Cables
- ☐ **12 XLR microphone lines** (snakes supplied with microphones; verify length and connectors)
- ☐ 3–4 extra XLR cables (spares)
- ☐ **1 shielded Cat5e Ethernet cable** for AES50. Long enough to reach from mixer to stage. EtherCON connectors preferred.
- ☐ 1 spare AES50-compatible cable
- ☐ **2 XLR female → ¼-inch TS cables** for SD8 → Yamaha StagePas
- ☐ **1 stereo 3.5 mm → dual ¼-inch TS cable** for laptop playback
- ☐ 1 backup 3.5 mm → dual RCA cable
- ☐ **2 Yamaha StagePas speaker cables** (included with system)
- ☐ 1 XLR cable for SD8 → first powered monitor
- ☐ 1 additional XLR cable per extra monitor, for daisy-chaining
- ☐ Spare adapters and cables as available

#### Power & Accessories
- ☐ Power cords for all powered speakers
- ☐ Extension cords and power strips
- ☐ Gaffer tape / cable covers
- ☐ Headphones
- ☐ Spare batteries (if needed)
- ☐ Microphone clips and adapters
- ☐ Laptop charger

**IMPORTANT:** The StagePas speakers are passive. Use the supplied Yamaha speaker cables from the StagePas powered mixer. Do not substitute ordinary instrument cables. [ManualsLib](https://www.manualslib.com/manual/3846803/Yamaha-Stagepas-400bt.html?utm_source=chatgpt.com)

### 2. System Signal Flow

#### Microphones & Tracks

**Microphones 1–12:**

Microphones → XLR snakes → X32 local inputs 1–12

**Backing tracks:**

Laptop headphone output → 3.5 mm stereo breakout → X32 Aux Inputs 1–2

Use the **AUX IN** connectors on the back of the mixer. They accept ¼-inch or RCA connections.

#### Outputs

**X32 Compact → AES50 A → SD8 Stage Box**

Planned SD8 connections:

- **Output 1:** Mono monitor mix (Bus 1)
- **Output 7:** Main Left
- **Output 8:** Main Right

**Main speakers:**

SD8 outputs 7–8 → Yamaha StagePas stereo line inputs 5/6 → Yamaha powered mixer → two passive speakers.

**Stage monitors:**

SD8 output 1 → first powered monitor → THRU → next powered monitor.

All monitors receive the same mono mix.

**Note:** Verify each monitor has a suitable THRU or MIX OUT connection. The Behringer B205D has a THRU output with its own level control. Other models may differ.

### 3. X32 Input Routing

**IMPORTANT: Check this first!**

The X32 Compact may have been used with a recording computer. Its inputs might be assigned to the USB card instead of the physical microphone connections.

Press **ROUTING**.

Under the input routing page, set:

- Inputs 1–8 → **Local 1–8**
- Inputs 9–16 → **Local 9–16**

This connects the 16 physical XLR inputs to channels 1–16.

For COB, use channels 1–12 for microphones.

The Compact has only 16 physical XLR inputs. Local 17–32 are not available on this model.

### 4. X32 Output Routing

This is the most important configuration to verify.

#### Step A: Assign Output Signals

Press **ROUTING**.

Find **Analog Out / Out 1–16** (menu names vary by firmware).

Set:

- Output 1 → **Mix Bus 1**
- Output 7 → **Main L**
- Output 8 → **Main R**

Use a post-fader output tap so the corresponding bus/master faders control output levels.

#### Step B: Send Outputs to AES50

Navigate to **AES50 A**.

Set:

**AES50 A outputs 1–8 → Out 1–8**

This sends the configured signals over the AES50 cable to the SD8.

#### Step C: Configure the SD8

- X32 AES50 A → SD8 AES50 A
- Verify that the SD8 shows synchronization.
- Set the SD8's physical **OUTPUT selector to 1–8**.
- Connect the speakers to SD8 outputs 1, 7, and 8.

The SD8 output selector determines which eight AES50 channels reach its physical XLR outputs. [Manuzoid](https://manuzoid.com/manuals/pWl7o-Behringer%20DIGITAL%20SNAKE%20SD8%20Quick%20start%20guide?utm_source=chatgpt.com)

**Test these connections before relying on them.**

### 5. Setting Microphone Gain

For each microphone:

1. Press the appropriate channel layer (1–8 or 9–16).
2. Press **SELECT** above the channel fader.
3. Have the performer sing or speak normally.
4. Adjust the **PREAMP GAIN** knob.
5. Watch the input meter.
6. Aim for healthy levels without clipping.
7. Raise the channel fader as needed.

The **SELECT** button determines which channel's processing controls you are adjusting.

Only enable **48V phantom power** for microphones that require it.

Make sure the channel is assigned to **Main LR**.

### 6. Setting Up the Monitor Mix

COB will use **one mono monitor mix**.

#### Sends on Faders

1. On the right-hand fader bank, choose **Bus 1–8**.
2. Press **SELECT** on Bus 1.
3. Press **SENDS ON FADERS**.
4. The input faders now control how much of each channel goes to Bus 1.
5. Adjust the mix for the performers.
6. Turn off Sends on Faders when finished.

**Important:** When Sends on Faders is active, the input faders are controlling the monitor mix, not the audience mix.

#### Monitor Master Volume

Bus 1 has its own master fader.

Make sure it is unmuted and raised appropriately.

Set microphone-to-monitor sends to **pre-fader**, so changes to the audience mix don't change the monitor balance.

Performers can adjust their individual speaker volume using the controls on their powered monitors.

### 7. Laptop Tracks

Connect:

Laptop 3.5 mm → X32 Aux In 1 and 2

Press the **AUX IN / USB** fader layer.

- Aux 1 = Left
- Aux 2 = Right

Link the two channels as a stereo pair if desired. Otherwise, pan them left and right.

Confirm they are assigned to Main LR.

Test playback before performers arrive.

**Check laptop volume, channel meters, channel faders, and Main LR.**

If performers need tracks in their monitors, send Aux 1–2 to Bus 1 as well.

### 8. Yamaha StagePas 400BT

The StagePas functions as the **power amplifier and speaker system**.

It receives the already-mixed signal from the X32.

Connect:

- SD8 Out 7 → StagePas 5/6 Left
- SD8 Out 8 → StagePas 5/6 Right

Use the StagePas stereo ¼-inch line inputs.

Connect both passive speakers using the included speaker cables.

Start with the StagePas input and master levels low. Raise gradually.

Use the **X32 for mixing**. The StagePas controls the overall speaker amplification.

You do not need to mix individual microphones on the StagePas.

### 9. Soundcheck Procedure

1. Connect everything with power off.
2. Check X32 input and output routing.
3. Power on the mixer and SD8.
4. Verify AES50 synchronization.
5. Turn on the powered speakers last, with levels low.
6. Play music from the laptop.
7. Verify sound from both main speakers.
8. Verify sound from the stage monitors.
9. Test each microphone individually.
10. Set gain for all microphones.
11. Build the performers' monitor mix.
12. Check for feedback.
13. Run a full song with tracks and microphones.

**Before the show:** Save a working X32 scene if time permits. Don't overwrite someone else's scene without permission.

### 10. Quick Troubleshooting

#### Microphone Has No Sound
- Correct input and channel?
- Channel muted?
- Input routing set to LOCAL?
- Gain sufficient?
- Channel assigned to Main LR?
- Main fader raised?

#### No Sound from Main Speakers
- Main LR unmuted and raised?
- Outputs 7–8 assigned to Main L/R?
- AES50 A set to Out 1–8?
- SD8 output selector set to 1–8?
- StagePas connected to correct inputs?
- StagePas input and master levels raised?

#### No Sound from Monitors
- Bus 1 master raised and unmuted?
- Input channels sending to Bus 1?
- Output 1 assigned to Bus 1?
- SD8 Out 1 connected to monitor?
- Monitor powered on?
- Monitor input level raised?

#### Feedback
- Lower the problematic microphone in Bus 1.
- Check microphone and speaker positioning.
- Reduce unnecessary monitor volume.
- Use EQ if necessary.
- Avoid placing microphones in front of speakers.

### 11. Things Still to Verify

- ☐ X32 Compact powers on and works correctly.
- ☐ Correct routing on the actual COB mixer.
- ☐ AES50 connection works with SD8.
- ☐ SD8 outputs 1, 7, and 8 work as planned.
- ☐ XLR-to-¼-inch cables fit StagePas inputs.
- ☐ All powered monitors can be daisy-chained.
- ☐ Microphone snakes reach the mixer.
- ☐ All required power cables are available.
- ☐ Working X32 scene is saved.

**Priority:** Get one microphone and the laptop working through the main PA, then configure and test the monitor mix.

Once everything works, save the configuration so it can be recalled for future rehearsals and performances.
