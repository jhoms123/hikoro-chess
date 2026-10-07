# Collection audio

The main menu and six games each have a local music track. The lobby uses RandomMind's *The Old Tower Inn*; Hikoro uses Indieteur's *Underwater World*; Hikorüka uses RandomMind's *Exploration*; Academy uses RandomMind's *The Bard's Tale*; Shavari uses iamoneabe's *Desert Loop*; Sho Dan Sho uses Tozan's *Asianoriental1*; Shield Go uses Yoiyami's *First Light Particles*.

Short movement and capture cues match water (Hikoro), wood (Hikorüka and Academy), stone (Shavari and Shield Go), and flower drops/chimes (Sho Dan Sho). Shielding, pass, interface actions, and match endings have separate cues. Credits, original download links, source manifests, and Kenney's original license texts are in `public/assets/audio/`.

Every recording is CC0. Music is compressed to 80 kbps stereo MP3 and normalized to −22 LUFS. Short effects use 96 kbps mono MP3, normalized to −18 LUFS. The 19 recordings total about 8 MB; only the active track and used effects load. There are no audio CDNs, tracking services, paid licenses, or new application dependencies.

The compact Sound control sits below each page header. It provides global mute, independent music/effects switches, and separate volume sliders. Preferences persist across pages and refreshes. Playback starts after a user tap or key press, follows browser autoplay rules, and pauses while the page is hidden. Music fades in; changing from the lobby to Hikoro replaces the menu track.

Effects follow accepted game actions, not clicks on arbitrary squares. Local and bot actions play once; online sounds wait for confirmed server state. Initial load, replay navigation, undo/redo, and reconnect history restoration are silent. Sho Dan Sho explicitly suppresses audio while rebuilding its accepted action journal. Rejected playback promises and storage failures do not block game input.

`site-audio.js` exposes the optional `SiteAudio` adapter. `transition` compares accepted states, `action` handles the Sho Dan Sho action engine, and `silence` wraps journal restoration. Removing or failing to load the audio layer does not change game rules. The shared server validator still runs without audio or browser globals.
