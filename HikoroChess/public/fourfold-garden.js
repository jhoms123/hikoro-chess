(function(){
"use strict";

// Compact edition: an 11 × 11 point lattice clipped to a six-step circle.
// The circular clip trims the corners and leaves 109 playable points.
const SIZE = 11;
const CENTER = 5;
const PLAYER_NAMES = ["Ivory", "Indigo"];
const PLAYER_CLASSES = ["owner0", "owner1"];
const BOT_OPENING_PROFILES = [
  {id:"tight",name:"Tight Loop"},
  {id:"wide",name:"Wide Loop"},
  {id:"diagonal",name:"Diagonal Weave"},
  {id:"balanced",name:"Balanced Ring"}
];
const FLOWER_RING = ["whiteJade", "whiteLotus", "rose", "vine", "chrysanthemum", "bamboo", "rhododendron", "thorn", "jasmine", "orchid", "lily", "peony"];
const TOOL_RING = ["rock", "knotweed", "mirror", "bridge", "boat", "wheel", "fan", "bell"];
const MIXED_TOOL_HARMONY = Object.freeze({
  rose:["wheel","bell"],
  vine:["knotweed","fan"],
  chrysanthemum:["wheel","fan"],
  bamboo:["knotweed","bell"],
  orchid:["fan","bell"],
  peony:["knotweed","wheel"]
});
const EXTRA_TOOL_HARMONY = new Set(["fan|knotweed","knotweed|wheel"]);
const SIGHT_EXCLUSIONS = [
  {a:"rose",b:"vine",axis:"orthogonal",label:"Rose–Vine row/column"},
  {a:"rose",b:"chrysanthemum",axis:"diagonal",label:"Rose–Chrysanthemum diagonal"}
];

const PIECE_ICONS = {
  rose:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M281.31 21.217L239.997 127.13l76.01 103.673 97.135-7.532-3.1-79.284-78.2-12.468-1.61 41.535 29.11 7.568-.766-14.1 18.662-1.012 2.15 39.635-68.41-17.788 3.004-77.61 68.65 10.946-2.456-86.044-98.863-13.43zM243.63 66.39l-73.702 39.917L195.885 243.7l141.306 80.704 154.447-80.037-11.252-142.205-79.617-.988.642 22.512 26.705 4.257 4.403 112.57-125.436 9.727-88.227-120.338 24.774-63.51zm-93.107 88.706c-2.992-.017-6.01.004-9.054.06-9.456.174-19.425.853-29.44 1.594 9.427 13.32 18.694 26.165 30.157 35.938 7.894 6.73 16.835 12.308 28.075 16.056l-10.1-53.453c-3.184-.11-6.396-.176-9.64-.194zm25.57 84.51c-14.278 5.27-27.16 13.25-39.437 23.55-17.875 14.995-34.273 35.22-50.625 58.47 56.9 2.6 100.16-6.41 147.316-35.01l-54.223-30.966-3.03-16.045zm270.854 48.968l-50.64 26.244c27.874 20.83 54.865 27.206 90.162 28.557-8.76-21.213-22.617-39.484-39.523-54.8zm-189.853 4.895c-14.566 9.75-28.84 17.8-43.156 24.342.37 10.843 2.813 19.703 6.968 26.47-29.49 37.69-61.714 72.017-96.78 102.843-17.584-1.215-24.577-19.137-17.845-37.344-22.758 18.074-30.427 42.166-20 68.376-6.832 5.23-13.75 10.354-20.78 15.344h45.344c25.65-20.11 49.915-41.82 72.844-65.094 29.485 9.192 54.05-1.51 69.625-27.97-14.975 8.052-31.217 5.627-37.438-6.686 9.653-11.06 19.037-22.436 28.156-34.125 7.25 1.21 15.586.57 24.72-2.03-8.863-17.974-13.326-39.19-11.656-64.126zm18.133 17.065c1.205 25.213 10.463 44.01 24.648 60.12 17.914 20.346 44.73 35.942 73.625 50.814 7.79-33.575 9.555-62.664-2.05-93.77l-34.692 17.978-61.53-35.143z"/></svg>',
  vine:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M398.97 17.5c-52.865.834-133.31 51.93-97.126 156.438 12.087-2.36 24.568-1.758 36.312 1.656-34.77-102.722 41.56-138.717 81.5-130.406 40.7 8.47 58.178 60.677 37.344 80.78-19.036 18.37-45.295 24.767-61.844 7.75-25.923-26.653-.047-63.278 37.97-58.968-45.166-23.858-83.427 26.427-59.22 61.406 24.985 36.103 82.66 40.462 109.063-5C514.27 77.258 461.215 18.47 401.56 17.5c-.865-.014-1.712-.014-2.593 0zm-170.814 1.688c13.627 38.648-4.29 53.002-19.72 72.124-9.066-27.893-32.84-41.827-55.53-41.593-24.57.252-47.854 17.088-49.75 50.78C127.812 50.362 191.84 60.614 191 130.625h.03c-.396 4.326-.44 9.015-.03 14.125 7.19-3.703 15.105-6.32 23.563-7.563 3.93-.574 7.85-.852 11.718-.812 3.115.033 6.183.28 9.22.688 7.406-38.218 61.06-55.133 37.188-117.875h-44.532zM87.47 21C-3.384 49.15 3.057 151.056 67.5 194.53c-35.316 19.842-53.083 74.65-16.25 121.126-17.08-51.437 7.57-97.026 45.813-97.906 14.594-13.436 34.042-20.828 54.062-20.313 1.31-6.294 3.39-12.338 6.156-18.03C49.75 184.102 4.483 81.236 87.47 21zm136.436 134.094c-2.206.052-4.442.24-6.656.562-27.155 3.99-46.7 26.346-48.906 52.563l-.844 9.905-9.844-1.47c-25.973-3.884-52.237 10.298-62.375 35.845-10.137 25.546-.758 53.864 20.814 68.844L124.25 327l-6.125 7.78c-16.145 20.615-17.167 49.867-.22 71.283 16.942 21.405 46.04 27.407 69.782 16.312l9.032-4.22 3.624 9.314c9.552 24.486 35.226 40.13 62.5 36.124 27.02-3.97 46.337-25.99 48.72-52.063l.905-9.842 9.78 1.437c25.973 3.886 52.237-10.264 62.375-35.813 10.138-25.548.728-53.86-20.844-68.843l-8.186-5.69 6.187-7.81c16.37-20.597 17.44-50.26.408-71.783-17.045-21.537-46.525-27.808-70.25-16.562l-9 4.28-3.688-9.25c-5.487-13.768-15.547-24.593-28.344-30.75-7.55-3.633-16.046-5.714-24.812-5.81-.73-.01-1.452-.02-2.188 0zm200.156 44.5c58.73 26.456 58.318 99.107-11.25 113.062-4.16-.044-8.443.217-12.812.813 4.47 9.48 7.003 19.854 7.313 30.467 56.123 3.103 80.57 64.37 42.75 116.907 60.76-39.278 48.297-109.04 3.5-136.563 58.818-28.563 48.388-120.77-29.5-124.686zM234.47 208.03l5.905 40.25c4.48.024 9.01.524 13.5 1.564l5.094-12.78 17.374 6.874-5.094 12.843c3.91 2.305 7.46 5.012 10.688 8.033l31.937-25.282 11.594 14.657L293.5 279.5c2.22 3.927 4.023 8.093 5.344 12.406l13.812-2.03 2.72 18.468-13.845 2.03c-.028 4.43-.538 8.882-1.56 13.313l37.936 15.032L331 356.093l-37.938-15.063c-2.3 3.917-4.98 7.487-8 10.72l8.72 11.03-14.657 11.595-8.75-11.063c-3.906 2.216-8.022 4.017-12.313 5.344L264 409.094l-18.47 2.72-5.936-40.408c-4.407-.015-8.838-.5-13.25-1.5l-5.156 13L203.813 376l5.125-12.938c-3.966-2.308-7.575-5.02-10.844-8.062l-31.97 25.313-11.593-14.657 31.97-25.312c-2.206-3.878-4.015-7.99-5.344-12.25l-13.656 2-2.72-18.5 13.595-2c.01-4.48.506-8.985 1.53-13.47l-37.78-15L149 263.75l37.78 15c2.317-3.96 5.046-7.58 8.095-10.844l-8.5-10.75 14.656-11.594 8.532 10.782c3.908-2.21 8.053-4.022 12.344-5.344L216 210.75l18.47-2.72zm4.5 58.876c-16.726.345-32.32 10.495-38.907 27.094-8.783 22.132 1.93 46.936 24.062 55.72 22.133 8.78 46.937-1.932 55.72-24.064 8.782-22.133-1.93-46.936-24.064-55.72-5.532-2.194-11.236-3.145-16.81-3.03zM50.405 387.78c-42.488 13.302-43.09 84.813 10.25 98.345 48.784 12.374 80.822-10.665 95.188-39.97-10.023-.934-19.82-3.876-28.813-8.655-10.313 19.2-29.745 33.275-60.5 24.063C32.05 451.23 25.348 407.9 50.407 387.78zm340.844 5.158c-8.206 10.524-18.95 18.563-30.97 23.562 20.846 17.897 28.375 43.38 18.564 77.97h36.906c11.214-40.23-.81-76.986-24.5-101.533z"/></svg>',
  chrysanthemum:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M256 24c-11.8 0-24.5 10.15-34.6 30.32-7.1 14.37-12.6 33.19-15.1 54.48 4.6 4 9.2 8.2 13.7 12.7 11.4 11.3 21.2 23.3 29.3 35.3 2.2-.1 4.5-.2 6.7-.2 2.4 0 4.8.1 7.2.3 8.1-12.1 17.9-24 29.3-35.4 4.3-4.3 8.8-8.5 13.3-12.3-2.6-21.44-8-40.42-15.2-54.88C280.5 34.15 267.8 24 256 24zM113.2 84.12c-9.2.13-16.33 2.76-20.99 7.44-8.32 8.32-10.16 24.44-3 45.84 7.15 21.4 22.89 46.5 45.59 69.2 8.3 8.3 17 15.7 25.6 22.1 9.5-33.2 35.9-59.3 69.2-68.5-6.4-8.8-13.9-17.6-22.3-26-22.7-22.7-47.8-38.48-69.2-45.64-9.4-3.13-17.8-4.54-24.9-4.44zm286.1 0c-7.1-.1-15.5 1.33-24.8 4.48-21.4 7.14-46.5 22.9-69.2 45.6-8.5 8.5-16 17.3-22.4 26.1 33.2 9.3 59.4 35.5 68.8 68.7 8.8-6.5 17.6-14 26-22.4 22.7-22.7 38.4-47.8 45.6-69.2 7.2-21.4 5.3-37.49-3-45.83-4.7-4.69-11.8-7.33-21-7.45zM256 174.6c-45.1 0-81.4 36.3-81.4 81.4 0 45.1 36.3 81.4 81.4 81.4 45.1 0 81.4-36.3 81.4-81.4 0-45.1-36.3-81.4-81.4-81.4zm-146.2 31.6c-21.67 2.5-40.87 8-55.48 15.2C34.15 231.5 24 244.2 24 256s10.15 24.5 30.32 34.6c14.48 7.2 33.48 12.6 54.88 15.2 4.1-4.7 8.4-9.4 12.9-13.9 11.2-11.2 22.9-20.9 34.7-28.9-.1-2.3-.2-4.6-.2-7 0-2.6.1-5.2.3-7.7-11.9-8-23.6-17.7-34.8-28.9-4.3-4.3-8.4-8.8-12.3-13.2zm292.8 0c-3.9 4.4-7.9 8.8-12.2 13.1-11.4 11.4-23.3 21.2-35.3 29.3.2 2.4.3 4.9.3 7.4 0 2.2-.1 4.5-.2 6.7 11.9 8 23.8 17.8 35.1 29.1 4.6 4.6 8.9 9.2 12.9 13.9 21.3-2.5 40.1-8 54.5-15.1 20.2-10.1 30.3-22.8 30.3-34.6s-10.1-24.5-30.3-34.6c-14.5-7.2-33.6-12.7-55.1-15.2zm-50.8 76.1c-9.1 33.4-35.3 59.8-68.5 69.3 6.3 8.6 13.6 17.2 21.9 25.4 22.7 22.7 47.8 38.4 69.2 45.6 21.4 7.1 37.5 5.3 45.8-3 8.4-8.3 10.2-24.5 3-45.9-7.1-21.4-22.9-46.5-45.6-69.2-8.4-8.4-17-15.8-25.8-22.2zm-191.6.4c-8.6 6.4-17.1 13.7-25.4 21.9-22.7 22.7-38.43 47.8-45.57 69.2-7.21 21.4-5.37 37.5 2.97 45.9 8.3 8.3 24.5 10.2 45.8 2.9 21.4-7.1 46.5-22.9 69.2-45.6 8.2-8.2 15.5-16.7 21.9-25.3-33.3-9.4-59.5-35.7-68.9-69zm88.6 72.4c-8 11.8-17.6 23.5-28.8 34.7-4.5 4.5-9.1 8.8-13.8 12.8 2.5 21.5 8 40.6 15.2 55.1 10.1 20.2 22.8 30.3 34.6 30.3s24.5-10.1 34.6-30.3c7.2-14.6 12.7-33.8 15.2-55.5-4.5-3.9-9-8.1-13.4-12.5-11.2-11.2-20.8-22.8-28.7-34.6-2.6.2-5.1.3-7.7.3-2.4 0-4.8-.1-7.2-.3z"/></svg>',
  bamboo:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M51.72 25c3.76 42 3.72 84 0 126h44.22c-4.56-41.6-3.68-83.68.28-126h-44.5zm181.68 0c2.6 54.1 5.5 108.6.4 164.7h44.3c-5-54.5-3.7-109.52.3-164.7h-45zm113.2 0c4.6 31.51 3.6 62.88-.4 94h44.1c-2.4-31.33-2.4-62.67 0-94h-43.7zm116.5 36.46s-41.4 7.81-53.5 23.86c-3.2 4.61-5.9 12.32-3 17.18 3.1 4.8 10.7 5 15.8 3.3 18.3-6 40.7-44.34 40.7-44.34zM173 106.9s12 42.7 28.1 53.1c4.6 3.1 12.2 4.6 16.3.7 4.1-3.9 3.4-12 1.4-17.2-7.8-18.7-45.8-36.6-45.8-36.6zm261.4 6.9c-4.6.1-8.9.6-12.5 1.8-6.3 2.2-14.1 8.1-13.8 14.7.1 6.6 8.2 12 14.8 13.8 23.6 6.2 71.5-16.6 71.5-16.6s-35.2-14-60-13.7zM346.2 137c6.2 47.7 7.1 95.1.2 142h43.8c-4-47.4-3.5-94.8.2-142h-44.2zm67.4 18.9c-2.2.1-4.3.8-5.9 2.3-4.1 3.9-3.4 12-1.4 17.2 7.8 18.7 45.8 36.6 45.8 36.6s-12-42.7-28.1-53.1c-2.6-1.7-6.1-3-9.5-3h-.9zm-255 12.3c-13.1.2-23.2 1.3-23.2 1.3s40.3 34.6 64.7 34.8c6.7-.1 16-3.1 17.8-9.4 2.1-6.3-3.8-14.1-9.5-17.9-10.1-6.8-28.4-8.6-44.1-8.8h-5.7zm-106.59.8c4.41 42.1 3.92 84.1-.2 126h44.42c-3.9-42.3-4.92-84.4-.31-126H52.01zm181.49 32c3.3 52.1 3.5 104.7 0 158h44.6c-5-53.5-3.7-106 .3-158h-44.9zm-76.4 22.6s-38 17.9-45.8 36.6c-2 5.2-2.7 13.3 1.4 17.2 4.1 3.9 11.7 2.4 16.3-.7 16.1-10.4 28.1-53.1 28.1-53.1zm-25.6 72.1c-6.7.2-15 3.1-16.9 9-2.1 6.2 3.6 14.1 9.1 18 19.9 14 72.8 9.4 72.8 9.4s-39.3-35.6-63.7-36.4h-1.3zm214.2 1.3c2.8 36.5 3.6 73.2.2 110h43.9c-4.6-38-1.7-74.3.6-110h-44.7zM51.61 313c3.96 58.2 2.72 116.2-.2 174h45.21c-2.49-57.7-4.56-115.7-.28-174H51.61zM121 337.8c-3.8.1-7.5 1.3-9.4 4.3-2.9 4.8-.2 12.6 3 17.2 12.1 16 53.5 23.8 53.5 23.8s-22.4-38.3-40.7-44.3c-1.9-.6-4.2-1-6.4-1zm359.7 19.4s-52.9 5.1-69.9 22.5c-4.6 4.8-8.9 13.7-5.6 19.4 3.1 5.8 12.8 6.9 19.5 5.5 23.8-5.2 56-47.4 56-47.4zM234 377c3.6 36.7.4 73.9-.7 110h45.2c-1.7-35.8-5.7-72.4-.8-110H234zm182 45c-5.2 0-11.1 2.3-12.7 6.9-1.9 5.3 2.4 12.2 6.6 16 15.4 13 57.4 11.6 57.4 11.6s-30.1-32.5-49.2-34.4c-.7-.1-1.4-.1-2.1-.1zm-70 3c2.1 20.3 3.3 41 .6 62h42.8c-2.8-21.1-1.4-41.8.7-62H346z"/></svg>',
  orchid:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M304.188 20.78c-66.4 29.275-7.705 118.11-67.344 199.095.002.01-.002.02 0 .03 4.68 23.896 1.18 50.524-15 61.407 5.676-10.848 4.674-33.22-.594-53.968C172.566 116.55 98.992 169.912 50.97 49.064c-7.508 115.22 76.944 106.685 121.405 219.03 25.28 4.854 48.27 21.84 42.406 49.375-8.74-28.164-38.682-37.34-74.655-29.94-49.053 14.66-79.57 51.282-119.03 39.033 42.903 46.394 89.77.747 146.28 14.968 10.2-6.306 21.764-10.282 32.375-10.092 6.877.123 13.343 2.007 18.78 6.125-17.464-2.606-52.255 20.413-64.436 42.062-11.036 31.072 5.565 72.344-24.063 118.156 64.557-9.482 55.983-72.112 96.032-104.967-5.95-23.987-.636-54.244 19.907-62.907-8.336 10.483-8.898 36.958-3.157 58.47 17.706 48.55 69.432 44.36 102.406 111.874 4.12-48.97-27.776-83.065-38.158-119.625-25.52-12.012-50.434-38.33-45.906-61.47 5.082 16.233 35.01 39.13 60.28 48.19 60.935 16.158 108.5-22.17 175.064 23.592-42.414-75.354-97.718-43.818-153.5-79.25-25.297 6.58-55.71 3.98-67.53-13.593 10.318 5.398 31.1 4.795 50.967.187.03-.01.063-.018.094-.03C425.25 261.26 418.945 146.456 494.5 138c-84.284-35.58-103.4 85.843-182.938 102.406-15.316 25.246-39.25 43.34-65.906 44.125 11.467-7.75 30.848-23.313 45.063-42.342-.085-.003-.167.002-.25 0 50.867-65.388-20.946-134.664 13.717-221.407zm136.5 49.69c-37.396.183-76.304 40.32-75.72 93.436 27.76-61.158 76.168-72.398 130-51.25-12.783-29.8-33.303-42.29-54.28-42.187zm-225.47.593c-.532-.013-1.08.006-1.624.03-4.982.224-10.477 1.986-16.438 5.626 30.17 20.098 45.097 56.783 31.656 111.468 29.054-43.44 19.963-116.347-13.593-117.125zM20.25 149.53v40.5c39.124 3.345 76.562 22.105 109.813 60.25-13.216-53.944-61.76-91.727-109.813-100.75zm127.688 202.907c-60.802 8.268-60.422 39.282-119.188 32.657 49.566 43.217 76.473-8.307 119.188-32.656zm273.468 32.938c-22.266.2-51.875 6.393-80.687 8.063 38.87 19.01 104.58-4.72 116.186 29.625 5.516-30.448-10.265-37.914-35.5-37.688z"/></svg>',
  peony:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M152.313 19.438C138.075 73.11 172.984 126.662 178.25 180.25c-28.744-16.01-71.286-25.18-88.656-43.656 9.36 29.558 51.055 44.096 77.094 66.312-57.236 1.556-101.637 65.75-148.125 79 54.52 31.628 111.427.296 167.437 23.875-27.654 34.76-47.284 67.888-57.97 107.283C148.787 384.2 174.07 351.39 198.72 326c-11.686 54.742 1.313 109.477 28.155 164.22 13.028-52.977 67.36-98.796 75.03-157.533 22.665 36.313 53.4 62.266 83.158 103.938-14.644-51.287-47.12-87.914-64.22-123.625 52.358 5.59 115.075 28.68 168.5 43.47-29.835-58.79-64.534-103.922-107.78-125.158 33.01.717 70.858 5.604 103.312 10.907-33.377-19.14-68.513-28.226-110-33.032 49.013-47.885 68.943-95.774 68.406-143.657-48.033 32.51-96.09 58.57-144.124 74.75 17.206-28.64 40.82-59.57 62-85.468-35.326 20.535-61.807 48.477-88.22 85.094-23.716-46.89-79.993-64.068-120.623-120.47zm35.625 72.937c8.325 26.55 49.006 61.23 63.718 91.625-7.935 2.196-15.188 5.65-21.437 10.063-9.67-33.43-46.513-71.114-42.282-101.688zm213.28 31.906c-20.144 34.656-47.403 60.806-83 86.72-2.394-7.408-7.083-13.755-13.124-18.563 31.454-17.384 66.972-44.313 96.125-68.156zm-129.812 75.814c6.66.108 12.638 1.57 17.375 3.97 7.22 3.653 11.376 8.906 12.345 15.436.97 6.53-1.55 13.663-7.53 20.188-5.983 6.524-15.326 12.01-26.283 14.218-10.956 2.208-21.094.686-28.312-2.97-7.218-3.653-11.374-8.906-12.344-15.436-.97-6.53 1.55-13.694 7.53-20.22 5.983-6.524 15.328-11.98 26.283-14.186 2.738-.552 5.424-.86 8.03-.97.977-.04 1.955-.046 2.906-.03zm-63.562 30.562c-.138 2.495-.034 5.02.344 7.563.983 6.622 3.748 12.55 7.718 17.56-36.236-7.654-91.958 24.29-125.062 10.157 34.23-.804 77.367-27.78 117-35.28zm107.5 10.25c43.444 16.685 78.393 35.883 108.406 65.72-39.556-17.844-87.918-37.4-126.563-45.47 3.768-2.62 7.204-5.558 10.188-8.812 3.177-3.465 5.884-7.328 7.97-11.438zM274.156 271.5l.22.03c-19.568 32.856-17.574 83.757-44.313 131.845 8.36-50.135 3.05-88.19 17.593-130.438 7.4 1.1 15.3.903 23.344-.718 1.07-.217 2.108-.46 3.156-.72z"/></svg>',
  knotweed:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M478 23.74c-11.3.28-23.5 1.47-34.9 3.67-16 3.08-30.4 8.33-37.9 13.88-.7 2.21-.9 5.24-.8 7.29 0 2.1.3 4.38.7 6.68 13.3-9.91 29.6-15.59 46.1-20.96-14.3 10.07-26.6 20.65-38.2 31.49 8.1 3.57 17.7 3.62 23.9-.77h.1c13.4-9.64 31.3-25.76 41-41.25zm-297.9 3.59c-2.7 0-5.6.3-8.6.97-2 9.79-.8 18.7 2.9 25.79-9-3.54-19.8-2.95-30.8 6.26 6.7 22.83 26.9 33 47.7 22.69.6 9.44.9 18.96.9 28.46-6.5-7.1-17.2-13.55-28.3-13.25-7.8.3-15.9 3.85-23 12.85 11.2 21 33 26.8 51.2 12.6-.2 10.3-.7 20.6-1.5 31-6.1-8.4-17-16.4-29.1-16.3-5.4.1-11 1.8-16.6 5.8 16 4.5 30.6 10.9 43.7 19.5 4.9 3.1 7.4 7.9 8.8 12.6 1.3 4.7 1.6 9.6 1.5 14.6-.4 10.2-2.8 20.9-6.4 30l-1.3 3-2.9 1.5c-2 1.1-4.3 2.2-6.5 3.3-2.1 12.8-4.4 25.7-6.9 38.7-14.8-18-29.7-24.6-44.4-24.7-37.59-.4-74.36 41.2-108.68 41.9 46.47 3.3 118.78-44.1 143.98 11.6 18.7 13.9 37.9 25.2 57.5 33.8 1.6-9.4 4.2-19.3 7.8-28.1 2.3-5.6 4.9-10.8 8.2-15.2 3.3-4.4 7.3-8.4 13.4-9.9 1.7-.5 3.5-.9 5.2-1.3-5.4-10.5-4.7-24.6 1.7-36.4 6.5-12.1 18.3-20.5 30.4-21.4 12.4-18.9 25.4-37.3 39.1-55.4 10.6 22.5 34 26.6 53.3 10.9-4.9-18.1-18-23.8-30.5-23.5-5.6.1-11.1 1.5-15.8 3.5 19.7-25.5 40.8-50 63.4-73.76-8.2-3.62-8.8-6.35-10.9-14.61-23 23.99-44.5 48.97-64.6 74.67-.5 15.9-9.5 30.2-24.7 33.2h-.2C289.4 186.3 280 200 271 214c2.3-14.9 4.6-30.2 7.4-45.4-7-4.4-12.6-11.8-15.7-20.4-9.5 30.5-16.3 62.9-25.1 90.9-1.2-.2-2.5-.3-3.7-.3-15.8-.1-29.7 13.6-33.3 23.9 12.1 10.4 25.4 12.4 36.3 7.6-4.1 7.3-8.3 14.7-12.3 22.1-3.6-1.6-7.3-2.4-10.8-2.4-11.4-.1-21.8 7.1-28.1 14.9 6.9-32.8 13.1-65.6 17.6-98.3 18.4 9.3 37.5 1.1 46-19.6-7.2-7.5-14.8-10.5-22-10.6-7.9-.1-15.4 3.4-21.3 8.1 1.3-11.3 2.3-22.6 3-33.9 18.8 18.5 43.1 13.5 55.1-9.1-7.1-9-15.2-12.5-23-12.8-13.6-.4-26.4 9.3-31.9 18.1.6-10.7 1-21.3 1-31.9 20.5 9.6 40.2-.6 46.8-23.2-7.2-6.03-14.3-8.36-20.8-8.26-10.8.16-20.2 6.95-26.2 14.71-.2-7.05-.6-14.1-1.1-21.13 23.4 7.71 42.3-6.26 44.5-30.81-19.8-10.93-35-.74-42.9 11.84-1.8-14.09-11-30.7-30.4-30.72zm178 13.92c-36.8 5.82-59.7 28.28-75.7 58l2.4-.6c5.3-1 10.4-.5 15 1.2 12.2-23.81 30.2-44.39 58.3-58.6zM490.2 105c-47.4 67.9-110.8 96.8-173.1 128.2 5.3 10.5 4.6 24.3-1.7 36v.1c65.8-40.8 132.8-79.5 174.8-164.3zm-89.7 4.4c-15.8-.2-29.7 13.7-33.3 23.9 20.9 18 45.3 10.9 55.3-13.3-7.2-7.5-14.8-10.5-22-10.6zm-111 6.8c-.4.1-.8.1-1.2.2-6.3 1.2-12 10.1-9.7 21.9 2.3 11.8 11 18 17.2 16.7 6.3-1.2 12-10.1 9.7-21.9-2.2-11.1-9.8-17.2-16-16.9zM84.98 154.4c-1.49 0-3.08.1-4.59.1 9.39 25.3 19.49 46.9 40.81 59.9h.1c14.2 9 31.2 6.5 45.9.9l-42.4-35.1 52.9 28c1.5-8.9 6.7-20.8 1.3-29.3h-.1v-.1c-24.5-15.9-55.3-24.1-93.92-24.4zm206.92 81.3c-5.5.2-12.2 4-16.5 11.9-5.7 10.6-2.9 20.9 2.7 23.9 8.6 3.7 18.2-5 21.4-10.8 5.7-10.6 2.9-20.8-2.7-23.9-1.4-.8-3.1-1.1-4.9-1.1zm-3.1 54.3c-1.5 0-3.1 0-4.6.1-9.2.4-18.2 1.8-27 4.1h-.1c.1 0-1.5.7-3.4 3.3-1.9 2.6-4.1 6.5-5.9 11.2-2.7 6.5-4.8 14.3-6.2 21.6l64-10.1-51.9 20.6c5.4 8 6.9 11.3 8.2 17.2 8.3 5.3 17.1 7.7 28.2 5 27.6-6.5 49.3-29 72-55.5-26-11.9-50.2-17.7-73.3-17.5zm-137.2 17.9l-9 22.9c32.7 14.4 60.6 31.1 87.3 47.9l12.5-22.6c-31.9-9.8-62-26.3-90.8-48.2zm-12.6 41c-20.9 27.3-46.01 51-74.71 64.9l7.88 16.2c33.33-16.2 60.93-43.1 83.53-73.2-5.4-2.7-11-5.4-16.7-7.9zm20.3 9.7c-23.6 42.1-46.3 72.1-70.35 116.1l15.85 8.6c23.4-42.9 46-73 70.5-116.3-5.2-2.8-10.6-5.6-16-8.4zm26.2 14.2c-24.6 37.7-42.2 68.5-59.6 108.3l16.4 7.2c17.1-39 34.2-68.8 58.6-106.4-5.1-3.1-10.2-6.2-15.4-9.1zm23 13.7c-15.4 26-17.1 57-19.8 80.6l17.8 2.1c2.9-24.2 5.1-52.2 17.3-73.1z"/></svg>',
  wheel:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M253.75 18.72C150.05 19.84 55.67 89.402 27.5 194.53-6.415 321.106 68.582 451.023 195.156 484.94c126.574 33.915 256.49-41.083 290.406-167.657C519.478 190.708 444.48 60.79 317.906 26.876c-19.777-5.3-39.657-7.957-59.22-8.156-1.65-.018-3.29-.02-4.936 0zm2.313 53.81c12.822-.048 25.848 1.247 38.843 4.032 1.034.222 2.06.48 3.094.72.488.115.98.223 1.47.343.51.123 1.018.247 1.53.375 1.004.255 1.994.512 3 .78 3.028.812 6.018 1.674 8.97 2.626 41.44 13.382 75.138 40.527 97.374 74.906.1.158.21.312.312.47.742 1.153 1.473 2.33 2.188 3.5.812 1.33 1.596 2.65 2.375 4 .733 1.27 1.452 2.555 2.155 3.843.594 1.09 1.177 2.18 1.75 3.28.107.207.206.42.313.626.08.16.17.312.25.47 18.66 36.453 25.32 79.192 16.187 121.78-.323 1.508-.7 3.026-1.063 4.533-.374 1.525-.747 3.037-1.156 4.562-.81 3.028-1.672 6.018-2.625 8.97-13.38 41.44-40.526 75.138-74.905 97.374-.157.1-.31.21-.47.31-1.153.743-2.33 1.474-3.5 2.19-1.328.81-2.65 1.595-4 2.374-1.27.734-2.554 1.453-3.842 2.156-1.09.594-2.18 1.177-3.282 1.75-.205.107-.417.206-.624.313-.157.08-.31.17-.47.25-36.452 18.66-79.19 25.32-121.78 16.187-1.507-.323-3.025-.693-4.53-1.063-.01-.002-.022.003-.032 0-1.516-.37-3.016-.75-4.53-1.156-3.03-.81-6.02-1.67-8.97-2.624-41.49-13.398-75.107-40.577-97.22-75-.068-.107-.15-.205-.218-.312-.773-1.21-1.505-2.43-2.25-3.656-.015-.025-.047-.04-.062-.063-.34-.56-.666-1.124-1-1.688-1.16-1.956-2.29-3.938-3.375-5.937-.7-1.287-1.395-2.57-2.064-3.875-.113-.22-.232-.436-.344-.656-18.464-36.382-24.94-79.035-15.812-121.533.324-1.506.693-3.025 1.063-4.53.002-.01-.003-.022 0-.032.37-1.516.75-3.017 1.156-4.53.33-1.242.672-2.463 1.03-3.69.08-.272.17-.54.25-.81.437-1.473.875-2.952 1.344-4.407.007-.022.024-.04.03-.063 13.345-41.36 40.262-75.04 74.44-97.313 1.284-.837 2.567-1.662 3.874-2.468.02-.012.042-.02.062-.03.99-.612 1.998-1.222 3-1.814.342-.202.688-.394 1.03-.594.687-.4 1.373-.797 2.064-1.187.485-.275.98-.544 1.47-.814.23-.13.453-.278.686-.406 1.314-.72 2.638-1.407 3.97-2.094 23.324-12.032 49.244-19.11 76.093-20.22 2.247-.09 4.49-.146 6.75-.155zm33.968 22.157l-25.75 96.188c3.07.368 6.15.96 9.22 1.78 3.062.822 6.01 1.85 8.844 3.064l25.78-96.22c-2.947-.97-5.933-1.874-8.968-2.688-3.038-.814-6.083-1.49-9.125-2.124zM182.5 109c-5.56 2.83-10.95 5.965-16.156 9.406l49.72 86.094c4.922-3.863 10.38-7.01 16.186-9.344L182.5 109zm211.72 56.594l-86.25 49.812c3.865 4.92 7.037 10.383 9.374 16.188l86.25-49.813c-2.812-5.572-5.953-10.965-9.375-16.186zM100.686 204.47c-.97 2.948-1.873 5.93-2.687 8.968-.81 3.025-1.522 6.065-2.156 9.093l95.687 25.626c.367-3.058.932-6.13 1.75-9.187.825-3.074 1.875-6.033 3.095-8.876l-95.688-25.625zM255.25 209c-20.188.584-38.553 14.304-44.03 34.75-6.68 24.925 8.23 50.79 33.155 57.47 24.925 6.677 50.79-8.233 57.47-33.158 6.677-24.924-8.233-50.79-33.158-57.468-3.115-.835-6.27-1.35-9.375-1.53-1.358-.08-2.716-.103-4.062-.064zm1.688 18.625c.408.008.807.037 1.218.063 1.88.117 3.792.43 5.688.937 15.17 4.065 24.033 19.424 19.97 34.594-4.066 15.17-19.425 24.032-34.595 19.967-15.17-4.064-24.035-19.423-19.97-34.593 3.446-12.86 15.01-21.206 27.688-20.97zm64.656 36.03c-.365 3.07-.928 6.152-1.75 9.22-.822 3.066-1.877 6.006-3.094 8.844l96.188 25.78c.97-2.948 1.874-5.934 2.687-8.97.81-3.025 1.524-6.063 2.156-9.092l-96.186-25.782zM195.78 280.22l-86.093 49.686c2.787 5.577 5.884 10.995 9.282 16.22l86.124-49.72c-3.857-4.922-6.983-10.384-9.313-16.187zm101.25 27.155c-4.92 3.86-10.383 7.01-16.186 9.344l49.812 86.25c5.566-2.81 10.942-5.96 16.156-9.376l-49.78-86.22zm-66.31 8.75l-25.782 96.188c2.947.97 5.933 1.874 8.968 2.687 3.026.81 6.065 1.524 9.094 2.156l25.78-96.187c-3.057-.367-6.128-.932-9.186-1.75-3.076-.825-6.03-1.873-8.875-3.095z"/></svg>',
  fan:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M392.121 381.388l-32.913-33.36c23.148-24.21 41.168-51.51 54.043-80.538l55.004 22.431 6.352-15.575-55.005-22.433c10.655-28.528 16.532-58.432 17.624-88.483l56.15.378.113-16.82-56.15-.378c-.744-32.325-7.013-64.556-18.835-95.163l36.752-15.46-6.523-15.504L269.6 95.829a127.212 127.212 0 0 1 6.513 15.511 128.442 128.442 0 0 1 6.739 34.348c.057.989.092 1.979.126 2.968.015.44.037.881.048 1.322.023.982.026 1.965.027 2.947.001.442.008.885.004 1.327-.008.975-.035 1.95-.066 2.924-.014.457-.025.913-.044 1.37-.04.936-.094 1.873-.154 2.808-.704 11.001-2.807 21.925-6.328 32.478-.24.72-.5 1.436-.754 2.154-.221.625-.437 1.25-.668 1.872-.297.797-.61 1.59-.922 2.382-.21.532-.415 1.065-.632 1.595-.356.867-.73 1.73-1.106 2.59-.188.432-.373.863-.566 1.293-.402.893-.817 1.781-1.24 2.667a127.196 127.196 0 0 1-20.435 30.49c-.693.769-1.389 1.536-2.103 2.292a129.7 129.7 0 0 1-3.024 3.095 129.666 129.666 0 0 1-3.135 2.982c-.765.704-1.542 1.389-2.32 2.071a127.196 127.196 0 0 1-30.763 20.023c-.891.41-1.785.814-2.684 1.204-.432.187-.866.367-1.3.549-.865.364-1.732.726-2.605 1.07-.532.21-1.068.408-1.603.61-.796.303-1.593.605-2.394.89-.625.223-1.253.43-1.88.643-.722.245-1.44.494-2.165.725a128.514 128.514 0 0 1-32.56 5.89c-.936.047-1.873.09-2.81.117-.457.013-.913.017-1.37.025-.975.018-1.95.032-2.925.027-.442-.002-.885-.015-1.327-.022-.982-.015-1.964-.03-2.946-.068-.44-.016-.88-.044-1.321-.065-.99-.048-1.979-.096-2.967-.166a128.442 128.442 0 0 1-34.254-7.2 127.218 127.218 0 0 1-15.421-6.722L18.51 444.948l15.415 6.73 15.953-36.54c30.445 12.233 62.588 18.936 94.9 20.116l-.377 56.15 16.82.113.378-56.15c30.063-.687 60.043-6.16 88.713-16.43l21.69 55.303 15.659-6.142-21.689-55.302c29.2-12.482 56.74-30.133 81.26-52.953l32.913 33.36zM233.2 232.287a113.305 113.305 0 0 0 5.767-6.131l-49.109-49.775 64.787 26.421A110.492 110.492 0 0 0 261 187.23l-62.295-25.406 67.273.453c.46-5.595.498-11.219.113-16.82l-69.967-.471 64.498-27.13a110.462 110.462 0 0 0-6.531-15.502l-67.808 28.522c10.696 15.023 9.242 36.178-4.28 49.52-13.524 13.342-34.697 14.511-49.574 3.613l-29.433 67.418c4.995 2.655 10.149 4.9 15.413 6.74l27.996-64.128-.472 69.968c5.596.46 11.22.498 16.82.113l.454-67.272 24.564 62.631a110.494 110.494 0 0 0 15.658-6.145l-25.547-65.137 49.11 49.774a113.307 113.307 0 0 0 6.207-5.683zm-63.012-63.867c8.522-8.407 8.613-21.876.205-30.398-8.407-8.521-21.876-8.612-30.398-.205-8.521 8.408-8.612 21.877-.204 30.398 8.407 8.522 21.876 8.613 30.397.205z"/></svg>',
  bell:'<svg class="piece-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill-rule="evenodd" d="M254.125 26.188c-17.377-.003-31.66 14.28-31.656 31.656 0 7.617 2.733 14.64 7.28 20.125-10.79 3.876-19.043 10.963-26.906 22.06-13.057 18.43-23.687 49.03-35.406 92.782-10.257 38.29-24.345 57.012-34.657 70.563-10.31 13.55-16.252 20.325-16.25 42.688.002 3.5 1.975 7.314 8.44 12.03 6.463 4.717 16.877 9.383 29.905 13.188 26.055 7.612 62.442 11.962 100.25 11.97 19.384.004 38.368-1.15 55.78-3.28v.124c12.13-1.043 33.332-3.898 51.345-10.28 5.795-2.055 11.28-4.422 16.125-7.533 2.612-1.376 4.947-2.747 6.875-4.155 6.458-4.714 8.438-8.523 8.438-12.03-.004-22.363-5.935-29.135-16.25-42.69-10.316-13.553-24.42-32.27-34.688-70.56-11.732-43.757-22.343-74.35-35.406-92.782-8.225-11.607-16.895-18.836-28.438-22.594 4.31-5.41 6.908-12.24 6.906-19.626-.002-17.377-14.31-31.654-31.687-31.657zm0 18.687c7.278 0 13 5.694 13 12.97 0 7.272-5.722 12.97-13 12.968-7.278-.002-12.968-5.696-12.97-12.97 0-7.273 5.693-12.97 12.97-12.968zm9.22 43.22c34.616 10.188 49.56 64.686 58.124 101.56 14.99 64.56 45.652 82.98 53.03 111.25-.327.633-1.002 1.286-2.094 2.408-2.665 2.74-8.816 6.216-16.406 8.906-7.366 2.61-16 4.614-24.188 6.124-1.73-38.024-33.765-53.55-33.25-107.47.603-63.043-17.19-103.352-39.5-121.78 1.468-.233 2.886-.57 4.282-1zm-206.876 91.28C23.546 223.947 11.19 289.253 28.874 355.25c18.208 67.957 63.562 118.994 116.313 140.03-38.592-30.418-72.26-83.223-89.75-148.5-16.674-62.228-14.924-122.366 1.03-167.405zm399.436 0c15.955 45.04 17.705 105.177 1.03 167.406-17.49 65.277-51.157 118.082-89.748 148.5 52.75-21.036 98.135-72.073 116.343-140.03 17.686-65.997 5.298-131.303-27.624-175.875zM105.687 210.28c-29.71 34.43-42.433 83.74-29.343 132.595 13.478 50.306 50.845 87.082 95.5 101.156-32.19-21.55-59.46-60.02-72.406-108.342-12.344-46.066-8.896-91.175 6.25-125.407zm301.032 0c15.144 34.233 18.56 79.342 6.217 125.407-12.947 48.322-40.185 86.793-72.375 108.344 44.655-14.073 81.99-50.85 95.47-101.155 13.09-48.856.396-98.166-29.313-132.594zM146.53 348.25c1.218 12.736 11.944 22.686 25 22.688 9.422 0 17.642-5.173 21.94-12.844-15.986-2.11-30.823-5.08-43.814-8.875-1.06-.31-2.09-.65-3.125-.97z"/></svg>'
};

const AFFINITY_COLORS=Object.freeze({"jade":"#2CA02C","amber":"#B88700","coral":"#D62728","teal":"#00A6B2","bronze":"#8C564B","violet":"#8755B5","copper":"#F07818","pearl":"#D957A8","silver":"#666666","cobalt":"#1F77B4"});
const PIECE_AFFINITIES=Object.freeze({"rose":["jade","coral","copper"],"vine":["jade","teal","bronze"],"chrysanthemum":["jade","teal","violet"],"bamboo":["jade","bronze","copper"],"orchid":["pearl","silver"],"peony":["pearl","cobalt","coral"],"knotweed":["bronze","cobalt","amber"],"wheel":["amber","violet","coral"],"fan":["teal","amber","silver"],"bell":["amber","copper","silver"]});
const DEFS = {
  rose:{name:"Rose",short:"Rose",group:"flower",glyph:"✿",count:1,ability:null,desc:"Flower wheel: resonates with types one to three steps away. May form clear diagonal Flower Harmony."},
  chrysanthemum:{name:"Chrysanthemum",short:"Chrysanthemum",group:"flower",glyph:"✾",count:1,ability:null,desc:"Flower wheel: resonates with types one to three steps away. May form clear diagonal Flower Harmony."},
  rhododendron:{name:"Rhododendron · R5",short:"Rhododendron",group:"flower",glyph:"❋",profile:"R5",count:0,ability:null,desc:"Flower wheel: resonates with types one to three steps away."},
  jasmine:{name:"Jasmine · W3",short:"Jasmine",group:"flower",glyph:"❀",profile:"W3",count:0,ability:null,desc:"Flower wheel: resonates with types one to three steps away."},
  lily:{name:"Lily · W4",short:"Lily",group:"flower",glyph:"⚜",profile:"W4",count:0,ability:null,desc:"Flower wheel: resonates with types one to three steps away."},
  whiteJade:{name:"White Jade · W5",short:"White Jade",group:"flower",glyph:"◇",profile:"W5",count:0,ability:null,desc:"Flower wheel: resonates with types one to three steps away."},
  whiteLotus:{name:"White Lotus",short:"White Lotus",group:"flower",glyph:"✺",count:0,ability:"lotus",desc:"Flower wheel relationships apply. Once, shield one friendly flower within two points until either piece moves."},
  orchid:{name:"Orchid",short:"Orchid",group:"flower",glyph:"❁",count:1,ability:"orchid",desc:"Flower wheel relationships apply. Once, push an adjacent enemy flower one point directly away; the destination must be empty."},
  vine:{name:"Vine",short:"Vine",group:"flower",glyph:"♧",count:1,ability:null,desc:"Flower wheel relationships apply. When adjacent to an active friendly Bamboo, Flower Harmony rays from either partner may pass through blockers."},
  bamboo:{name:"Bamboo",short:"Bamboo",group:"flower",glyph:"║",count:1,ability:null,desc:"Flower wheel relationships apply. When adjacent to an active friendly Vine, Flower Harmony rays from either partner may pass through blockers."},
  thorn:{name:"Thorn",short:"Thorn",group:"flower",glyph:"✣",count:0,ability:"thorn",desc:"Flower wheel relationships apply. Once, slide an enemy flower in a clear row or column, up to three points away, one point sideways."},
  peony:{name:"Peony",short:"Peony",group:"flower",glyph:"✧",count:1,ability:null,desc:"Passive Counterpoint: if two friendly Flowers dissonate with the Peony from opposite sides on one clear row or column, their two Dissonance links become a Harmony link between them while all three Flowers remain active."},
  rock:{name:"Rock",short:"Rock",group:"tool",glyph:"●",count:0,ability:null,desc:"Passive: cancels Flower rays along its entire row and column. Rocks are anchored and cannot be shifted."},
  knotweed:{name:"Knotweed",short:"Knotweed",group:"tool",glyph:"♣",count:1,ability:null,desc:"Passive Counterpoint: if two friendly Tools dissonate with Knotweed from opposite sides on one clear row or column, their two Dissonance links become a Harmony link between them while all three Tools remain active."},
  mirror:{name:"Mirror",short:"Mirror",group:"tool",glyph:"◈",count:0,ability:"mirror",desc:"Once, activate its reflection. It bends compatible Flower rays through a right angle until the Mirror moves."},
  bridge:{name:"Bridge",short:"Bridge",group:"tool",glyph:"═",count:0,ability:"bridge",desc:"Once, connect two compatible friendly flowers through this Bridge until one of the three moves."},
  boat:{name:"Boat",short:"Boat",group:"tool",glyph:"⌁",count:0,ability:"boat",desc:"Once, carry a Flower within 1 point to an empty point within 1 point of the Boat (2 if the Boat sits in Neutral)."},
  wheel:{name:"Wheel",short:"Wheel",group:"tool",glyph:"◉",count:1,ability:"wheel",desc:"Once, rotate the eight surrounding points clockwise if the full ring is on the board and contains no Rock."},
  fan:{name:"Fan",short:"Fan",group:"tool",glyph:"≋",count:1,ability:"fan",desc:"Once, push a straight contiguous row or column of up to 3 tiles one point into an empty point (4 if in Neutral). Rocks cannot move."},
  bell:{name:"Bell",short:"Bell",group:"tool",glyph:"♢",count:1,ability:"bell",desc:"Once, pull an enemy tile along a clear row or column within 2 points (3 from Neutral) toward the Bell."}
};

let state;
let undoState = null;
let selectedType = null;
let mode = "place";
let pending = null;
let lastPoint = -1;
let opponentMode = "human";
let botThinking = false;
let botPaused = false;
let botTimer = null;
let botStepDelay = 450;
let onlineGameId = null;
let onlineSocket = null;
let onlineSeat = null;
let onlineConnected = false;
let onlinePending = false;
let applyingOnlineState = false;
let engineActionIntent = null;

function idx(x,y){return y*SIZE+x}
function xy(i){return {x:i%SIZE,y:Math.floor(i/SIZE)}}
function playableAt(x,y){
  if(x<0||y<0||x>=SIZE||y>=SIZE)return false;
  const dx=x-CENTER,dy=y-CENTER;
  return dx*dx+dy*dy<=36;
}
function inBounds(x,y){return playableAt(x,y)}
function pieceAt(x,y){return inBounds(x,y)?state.board[idx(x,y)]:null}
function isGate(x,y){return (x===CENTER&&(y===0||y===SIZE-1))||(y===CENTER&&(x===0||x===SIZE-1))}
function regionsAt(x,y){
  if(!playableAt(x,y))return [];
  if(isGate(x,y))return ["gate"];
  const dx=x-CENTER,dy=y-CENTER,diamond=Math.abs(dx)+Math.abs(dy),zones=[];
  if(diamond>=5)zones.push("neutral");
  if(diamond<=5){
    if(dx===0||dy===0){zones.push("red","white");if(dx===0&&dy===0)zones.push("center")}
    else zones.push(dx*dy<0?"red":"white");
  }
  return zones;
}
function regionAt(x,y){
  const zones=regionsAt(x,y);
  if(zones.indexOf("center")>=0)return "center";
  if(zones.indexOf("gate")>=0)return "gate";
  if(zones.indexOf("red")>=0&&zones.indexOf("white")<0)return "red";
  if(zones.indexOf("white")>=0&&zones.indexOf("red")<0)return "white";
  return "neutral";
}
function newState(){
  const reserves=[{},{}],reserveSpent=[{},{}];
  Object.keys(DEFS).forEach(function(type){reserves[0][type]=DEFS[type].count;reserves[1][type]=DEFS[type].count;reserveSpent[0][type]=0;reserveSpent[1][type]=0});
  const profiles=BOT_OPENING_PROFILES.map(function(profile){return profile.id});
  for(let i=profiles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const value=profiles[i];profiles[i]=profiles[j];profiles[j]=value}
  return {board:Array(SIZE*SIZE).fill(null),reserves:reserves,reserveSpent:reserveSpent,current:0,ply:0,turnCounts:[0,0],turnStage:"place",turnPlacedId:null,lastPlacementFinalReserve:false,passes:0,winner:null,draw:false,repetitionCounts:{},lastRepetitionCount:0,log:[],captured:[[],[]],pickedUp:[[],[]],botPlacementHistory:[[],[]],botCenterPlans:[null,null],botOpeningStyles:profiles.slice(0,2),botOpeningAxes:[Math.random()<.5?"horizontal":"vertical",Math.random()<.5?"horizontal":"vertical"],botOpeningSeeds:[Math.floor(Math.random()*4294967296),Math.floor(Math.random()*4294967296)],nextId:1};
}
function openingProfile(owner){
  const id=state.botOpeningStyles&&state.botOpeningStyles[owner];
  return BOT_OPENING_PROFILES.find(function(profile){return profile.id===id})||BOT_OPENING_PROFILES[0];
}
function openingIsActive(owner){return !state.turnCounts||state.turnCounts[owner]<3}
function openingStyleText(owner){return openingProfile(owner).name}
function openingPlanShapeScore(owner,rectangle){
  if(!openingIsActive(owner))return 0;
  const style=openingProfile(owner).id,spanX=rectangle.x2-rectangle.x1,spanY=rectangle.y2-rectangle.y1,compact=Math.max(0,spanX+spanY-4),difference=Math.abs(spanX-spanY);
  if(style==="tight")return -compact*1.15-difference*.12;
  if(style==="wide")return Math.min(compact,12)*.92-Math.max(0,compact-12)*.35;
  if(style==="diagonal"){
    const axis=state.botOpeningAxes&&state.botOpeningAxes[owner]||"horizontal";
    return Math.max(0,difference-1)*1.1+(axis==="horizontal"?spanX-spanY:spanY-spanX)*.28;
  }
  return Math.min(compact,8)*.95-Math.max(0,compact-8)*.35-difference*1.35;
}
function openingPatternBonus(owner,types){
  if(!openingIsActive(owner))return 0;
  const style=openingProfile(owner).id;
  if(style==="tight")return (types.indexOf("rose")>=0?1.25:0)+(types.indexOf("chrysanthemum")>=0?1.25:0);
  if(style==="wide")return (types.indexOf("vine")>=0?1.5:0)+(types.indexOf("bamboo")>=0?1.5:0);
  if(style==="diagonal")return (types.indexOf("rose")>=0?2:0)+(types.indexOf("chrysanthemum")>=0?2:0);
  return (types.indexOf("peony")>=0?1.8:0)+(types.indexOf("orchid")>=0?.45:0);
}
function openingTieBreak(owner,key){
  const seeds=state.botOpeningSeeds||[0,0];let hash=(seeds[owner]||0)>>>0;
  const text=String(key);
  for(let i=0;i<text.length;i++){hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0}
  return ((hash%1001)/1000)-.5;
}
function botOpeningNote(){
  if(opponentMode==="watch")return (botPaused?"Bot match paused. ":"Watching both bots. ")+"Opening profiles: Ivory — "+openingStyleText(0)+"; Indigo — "+openingStyleText(1)+". Use Pause bot match to stop the action.";
  if(opponentMode==="bot-indigo")return "You control Ivory; Indigo bot opening style: "+openingStyleText(1)+".";
  if(opponentMode==="bot-ivory")return "Ivory bot opening style: "+openingStyleText(0)+"; you control Indigo.";
  return "Two players share this device; choose pieces and take turns.";
}
function hasReservePieces(owner){
  return Object.keys(DEFS).some(function(type){return (state.reserves[owner][type]||0)>0});
}
function hasOwnedBoardPiece(owner){
  return state.board.some(function(piece){return piece&&piece.owner===owner});
}
function takeFromReserve(owner,type){
  const count=state.reserves[owner][type]||0,spent=state.reserveSpent[owner][type]||0,used=!!DEFS[type].ability&&spent>=count;
  state.reserves[owner][type]=count-1;
  if(used)state.reserveSpent[owner][type]=spent-1;
  return used;
}
function returnToReserve(piece){
  state.reserves[piece.owner][piece.type]=(state.reserves[piece.owner][piece.type]||0)+1;
  if(DEFS[piece.type].ability&&piece.used)state.reserveSpent[piece.owner][piece.type]=(state.reserveSpent[piece.owner][piece.type]||0)+1;
}
function clone(value){return JSON.parse(JSON.stringify(value))}
function cloneBotSearchState(source){
  return {board:source.board.map(function(p){return p?Object.assign({},p,{bridgePair:p.bridgePair?p.bridgePair.slice():null}):null}),reserves:source.reserves.map(function(r){return Object.assign({},r)}),reserveSpent:source.reserveSpent.map(function(r){return Object.assign({},r)}),current:source.current,ply:source.ply,turnCounts:source.turnCounts.slice(),turnStage:source.turnStage,turnPlacedId:source.turnPlacedId,lastPlacementFinalReserve:source.lastPlacementFinalReserve,passes:source.passes,winner:source.winner,draw:source.draw,repetitionCounts:Object.assign({},source.repetitionCounts||{}),lastRepetitionCount:source.lastRepetitionCount||0,log:[],captured:source.captured.map(function(a){return a.slice()}),pickedUp:source.pickedUp.map(function(a){return a.slice()}),botPlacementHistory:(source.botPlacementHistory||[[],[]]).map(function(a){return a.map(function(m){return {type:m.type,index:m.index}})}),botCenterPlans:(source.botCenterPlans||[null,null]).map(function(p){return p?{cells:p.cells.slice(),types:p.types.slice()}:null}),botOpeningStyles:(source.botOpeningStyles||["tight","wide"]).slice(),botOpeningAxes:(source.botOpeningAxes||["horizontal","vertical"]).slice(),botOpeningSeeds:(source.botOpeningSeeds||[0,0]).slice(),nextId:source.nextId,lastStatus:source.lastStatus};
}
function setStatus(main,detail){
  if(typeof document==="undefined"||!document.getElementById("board"))return;
  document.getElementById("statusMain").textContent=main;
  document.getElementById("statusDetail").textContent=detail;
}
function addLog(text,kind){
  state.log.unshift({text:text,kind:kind||""});
  if(state.log.length>28)state.log.pop();
}
function ownersName(owner){
  const profile=onlineGameId&&state&&state.playerProfiles&&state.playerProfiles[owner];
  return profile&&profile.display_name?profile.display_name:PLAYER_NAMES[owner]
}
function uiText(value){
  return typeof window!=="undefined"&&window.I18n?window.I18n.t(value):value;
}
function isFlower(piece){return !!piece&&DEFS[piece.type].group==="flower"}
function isTool(piece){return !!piece&&DEFS[piece.type].group==="tool"}
function isAligned(a,b){
  const A=xy(a),B=xy(b);
  return A.x===B.x||A.y===B.y;
}
function isDiagonal(a,b){
  const A=xy(a),B=xy(b);
  return A.x!==B.x&&A.y!==B.y&&Math.abs(A.x-B.x)===Math.abs(A.y-B.y);
}
function forbiddenSightConflict(board){
  const cells=board||state.board;
  for(let i=0;i<cells.length;i++){
    const a=cells[i];if(!a)continue;
    for(let j=i+1;j<cells.length;j++){
      const b=cells[j];if(!b)continue;
      const rule=SIGHT_EXCLUSIONS.find(function(r){return (a.type===r.a&&b.type===r.b)||(a.type===r.b&&b.type===r.a)});
      if(!rule)continue;
      if(rule.axis==="orthogonal"?isAligned(i,j):isDiagonal(i,j))return {a:a,b:b,ia:i,ib:j,rule:rule};
    }
  }
  return null;
}
function boardAfterMove(from,to){
  if(from<0||to<0||from>=state.board.length||to>=state.board.length||!state.board[from]||state.board[to])return null;
  const board=state.board.slice();board[to]=board[from];board[from]=null;return board;
}
function movementPreservesSight(from,to){
  const board=boardAfterMove(from,to);return !!board&&!forbiddenSightConflict(board);
}
function placementSightConflict(type,index){
  if(index<0||index>=state.board.length||state.board[index])return null;
  const board=state.board.slice();board[index]={type:type,owner:state.current};
  return forbiddenSightConflict(board);
}
function isDiagonalFlower(type){return type==="rose"||type==="chrysanthemum"}
function canFlowerHarmonyAlign(aType,bType,aIndex,bIndex){
  return isAligned(aIndex,bIndex)||(isDiagonal(aIndex,bIndex)&&(isDiagonalFlower(aType)||isDiagonalFlower(bType)));
}
function manhattan(a,b){const A=xy(a),B=xy(b);return Math.abs(A.x-B.x)+Math.abs(A.y-B.y)}
function chebyshev(a,b){const A=xy(a),B=xy(b);return Math.max(Math.abs(A.x-B.x),Math.abs(A.y-B.y))}
function relation(aType,bType,group){
  const ring=group==="flower"?FLOWER_RING:group==="tool"?TOOL_RING:null;
  if(!ring)return null;
  if(group==="tool"&&EXTRA_TOOL_HARMONY.has([aType,bType].sort().join("|")))return "H";
  const a=ring.indexOf(aType),b=ring.indexOf(bType);
  if(a<0||b<0)return "D";
  const gap=Math.abs(a-b),distance=Math.min(gap,ring.length-gap);
  return distance>=1&&distance<=(group==="flower"?3:2)?"H":"D";
}
function mixedRelation(flowerType,toolType){
  return (MIXED_TOOL_HARMONY[flowerType]||[]).indexOf(toolType)>=0?"H":"D";
}
function mixedHarmonyCanAlign(flowerType,flowerIndex,toolIndex){
  return isAligned(flowerIndex,toolIndex)||(isDiagonal(flowerIndex,toolIndex)&&isDiagonalFlower(flowerType));
}
function pieceRelation(a,b,group){
  return relation(a&&a.type,b&&b.type,group);
}
function getPieces(group){
  const out=[];
  state.board.forEach(function(p,i){if(p&&(!group||DEFS[p.type].group===group))out.push({piece:p,index:i,pos:xy(i)})});
  return out;
}
function eligiblePickupPieces(owner,allowPlacedFallback){
  const own=getPieces().filter(function(q){return q.piece.owner===owner});
  const older=own.filter(function(q){return q.piece.id!==state.turnPlacedId});
  return older.length||!allowPlacedFallback?older:own;
}
function canPickUpPiece(piece,owner,allowPlacedFallback){
  return !!piece&&eligiblePickupPieces(owner,allowPlacedFallback).some(function(q){return q.piece.id===piece.id});
}
function clearSpecialEffectsOnMove(pieceOrId){
  const id=typeof pieceOrId==="string"?pieceOrId:pieceOrId&&pieceOrId.id;
  if(!id)return;
  getPieces().forEach(function(q){
    const p=q.piece;
    if(p.id===id&&p.type==="mirror")p.mirrorActive=false;
    if(p.bridgePair&&(p.id===id||p.bridgePair.indexOf(id)>=0))p.bridgePair=null;
    if(p.type==="whiteLotus"&&(p.id===id||p.shieldTarget===id))p.shieldTarget=null;
  });
}
function isShielded(piece){
  return getPieces("flower").some(function(q){return q.piece.type==="whiteLotus"&&q.piece.shieldTarget===piece.id});
}
function lineIndices(a,b,allowDiagonal){
  if(!isAligned(a,b)&&!(allowDiagonal&&isDiagonal(a,b)))return [];
  const A=xy(a),B=xy(b),dx=Math.sign(B.x-A.x),dy=Math.sign(B.y-A.y),out=[];
  let x=A.x+dx,y=A.y+dy;
  while(x!==B.x||y!==B.y){out.push(idx(x,y));x+=dx;y+=dy}
  return out;
}
function lineClear(a,b,ignoreIds,allowDiagonal){
  if(!isAligned(a,b)&&!(allowDiagonal&&isDiagonal(a,b)))return false;
  const ignores=ignoreIds||[];
  const cells=lineIndices(a,b,allowDiagonal);
  for(let i=0;i<cells.length;i++){
    const p=state.board[cells[i]];
    if(p&&ignores.indexOf(p.id)<0)return false;
  }
  return true;
}
function rockBlocksFlowerLine(a,b,allowDiagonal){
  if(!isAligned(a,b)&&!(allowDiagonal&&isDiagonal(a,b)))return false;
  const A=xy(a),B=xy(b);
  const diagonalCells=allowDiagonal&&isDiagonal(a,b)?lineIndices(a,b,true):[];
  return getPieces("tool").some(function(q){
    if(q.piece.type!=="rock")return false;
    return (A.y===B.y&&q.pos.y===A.y)||(A.x===B.x&&q.pos.x===A.x)||diagonalCells.indexOf(q.index)>=0;
  });
}
function activeBond(a,b){
  if(!a||!b||a.owner!==b.owner)return false;
  const pair=(a.type==="vine"&&b.type==="bamboo")||(a.type==="bamboo"&&b.type==="vine");
  if(!pair)return false;
  const ia=state.board.indexOf(a),ib=state.board.indexOf(b);
  return manhattan(ia,ib)===1;
}
function pointBetween(c,a,b){
  if(!isAligned(a,b))return false;
  const cells=lineIndices(a,b);
  return cells.indexOf(c)>=0;
}
function bridgePairActive(a,b){
  const ai=state.board.indexOf(a),bi=state.board.indexOf(b);
  if(ai<0||bi<0||!isAligned(ai,bi))return false;
  for(let i=0;i<state.board.length;i++){
    const p=state.board[i];
    if(p&&p.type==="bridge"&&p.bridgePair){
      const ids=p.bridgePair.slice().sort();
      if(ids[0]===a.id&&ids[1]===b.id&&pointBetween(i,ai,bi))return true;
    }
  }
  return false;
}
function lineClearForPair(a,b,disabled){
  const ai=state.board.indexOf(a),bi=state.board.indexOf(b);
  const diagonal=isDiagonal(ai,bi);
  if(!canFlowerHarmonyAlign(a.type,b.type,ai,bi))return false;
  if(rockBlocksFlowerLine(ai,bi,diagonal))return false;
  if(bridgePairActive(a,b))return true;
  const bonded=getPieces("flower").some(function(q){
    return activeBond(a,q.piece)&&!disabled[a.id]&&!disabled[q.piece.id]||
      activeBond(b,q.piece)&&!disabled[b.id]&&!disabled[q.piece.id];
  });
  if(bonded)return true;
  return lineClear(ai,bi,[],diagonal);
}
function mirrorPath(a,b){
  if(a.owner!==b.owner||pieceRelation(a,b,"flower")!=="H")return null;
  const A=state.board.indexOf(a),B=state.board.indexOf(b),pa=xy(A),pb=xy(B);
  const mirror=getPieces("tool").find(function(q){
    if(q.piece.type!=="mirror"||!q.piece.mirrorActive)return false;
    const m=q.pos;
    const alignedAM=(pa.x===m.x||pa.y===m.y),alignedMB=(pb.x===m.x||pb.y===m.y);
    if(!alignedAM||!alignedMB)return false;
    const perp=(pa.x===m.x&&pb.y===m.y)||(pa.y===m.y&&pb.x===m.x);
    if(!perp)return false;
    const mi=q.index;
    if(rockBlocksFlowerLine(A,mi)||rockBlocksFlowerLine(mi,B))return false;
    const clearA=lineClear(A,mi,[q.piece.id]);
    const clearB=lineClear(mi,B,[q.piece.id]);
    return clearA&&clearB;
  });
  return mirror?mirror.index:null;
}
function computeRawDissonance(group){
  const pieces=getPieces(group),counts={};
  pieces.forEach(function(q){counts[q.piece.id]=0});
  const rawLinks=[];
  for(let i=0;i<pieces.length;i++){
    for(let j=i+1;j<pieces.length;j++){
      const a=pieces[i].piece,b=pieces[j].piece;
      if(pieceRelation(a,b,group)!=="D")continue;
      if(!isAligned(pieces[i].index,pieces[j].index))continue;
      if(group==="flower"&&rockBlocksFlowerLine(pieces[i].index,pieces[j].index))continue;
      if(!lineClear(pieces[i].index,pieces[j].index))continue;
      rawLinks.push({a:a.id,b:b.id,ia:pieces[i].index,ib:pieces[j].index});
    }
  }
  const converted=new Set(),counterpoints=[];
  function key(link){return [link.a,link.b].sort().join("|")}
  function direction(from,to){
    const a=xy(from),b=xy(to);
    if(a.x===b.x)return b.y<a.y?"north":"south";
    if(a.y===b.y)return b.x<a.x?"west":"east";
    return null;
  }
  pieces.forEach(function(pivotInfo){
    const pivot=pivotInfo.piece;
    const isPivot=group==="flower"?pivot.type==="peony":pivot.type==="knotweed";
    if(!isPivot)return;
    const byDirection={};
    rawLinks.forEach(function(link){
      let otherId=null;
      if(link.a===pivot.id)otherId=link.b;
      else if(link.b===pivot.id)otherId=link.a;
      if(!otherId)return;
      const other=findById(otherId);
      if(!other||other.owner!==pivot.owner)return;
      const dir=direction(pivotInfo.index,indexOfId(otherId));
      if(dir&&!byDirection[dir])byDirection[dir]={link:link,other:other};
    });
    [["west","east"],["north","south"]].forEach(function(axis){
      const left=byDirection[axis[0]],right=byDirection[axis[1]];
      if(!left||!right)return;
      const leftKey=key(left.link),rightKey=key(right.link);
      if(converted.has(leftKey)||converted.has(rightKey))return;
      converted.add(leftKey);converted.add(rightKey);
      counterpoints.push({a:left.other.id,b:right.other.id,pivot:pivot.id,group:group});
    });
  });
  const links=rawLinks.filter(function(link){return !converted.has(key(link))});
  links.forEach(function(link){counts[link.a]=(counts[link.a]||0)+1;counts[link.b]=(counts[link.b]||0)+1});
  return {counts:counts,links:links,counterpoints:counterpoints};
}
function computeRawMixedDissonance(){
  const flowers=getPieces("flower"),tools=getPieces("tool"),counts={},links=[];
  flowers.concat(tools).forEach(function(q){counts[q.piece.id]=0});
  flowers.forEach(function(flower){
    tools.forEach(function(tool){
      if(mixedRelation(flower.piece.type,tool.piece.type)!=="D"||!isAligned(flower.index,tool.index))return;
      if(rockBlocksFlowerLine(flower.index,tool.index)||!lineClear(flower.index,tool.index))return;
      links.push({a:flower.piece.id,b:tool.piece.id,ia:flower.index,ib:tool.index});
      counts[flower.piece.id]=(counts[flower.piece.id]||0)+1;
      counts[tool.piece.id]=(counts[tool.piece.id]||0)+1;
    });
  });
  return {counts:counts,links:links};
}
function refreshDissonance(){
  const flowerD=computeRawDissonance("flower");
  const toolD=computeRawDissonance("tool");
  const mixedD=computeRawMixedDissonance();
  const fDisabled={};
  getPieces("flower").forEach(function(q){
    const p=q.piece,raw=(flowerD.counts[p.id]||0)+(mixedD.counts[p.id]||0);
    const region=regionAt(q.pos.x,q.pos.y);
    let threshold=region==="red"?1:region==="white"?3:2;
    if(isShielded(p))threshold++;
    fDisabled[p.id]=raw>=threshold;
  });
  const tDisabled={};
  getPieces("tool").forEach(function(q){
    const p=q.piece;
    tDisabled[p.id]=(toolD.counts[p.id]||0)+(mixedD.counts[p.id]||0)>0;
  });
  return {flowerD:flowerD,toolD:toolD,mixedD:mixedD,fDisabled:fDisabled,tDisabled:tDisabled};
}
function getFlowerLinks(disabled,counterpoints){
  const pieces=getPieces("flower"),links=[];
  function add(a,b,path,via){
    const key=[a.id,b.id].sort().join("|");
    if(links.some(function(l){return l.key===key}))return;
    const ia=state.board.indexOf(a),ib=state.board.indexOf(b);
    links.push({a:a.id,b:b.id,ia:ia,ib:ib,key:key,path:path||"line",via:via,diagonal:(path||"line")==="line"&&isDiagonal(ia,ib)});
  }
  for(let i=0;i<pieces.length;i++){
    for(let j=i+1;j<pieces.length;j++){
      const a=pieces[i].piece,b=pieces[j].piece;
      if(a.owner!==b.owner||pieceRelation(a,b,"flower")!=="H")continue;
      if(disabled[a.id]||disabled[b.id])continue;
      if(lineClearForPair(a,b,disabled)){
        const bridge=bridgePairActive(a,b);
        add(a,b,bridge?"bridge":activeBond(a,b)?"bond":"line");
      }else{
        const via=mirrorPath(a,b);
        if(via!==null)add(a,b,"mirror",via);
      }
    }
  }
  (counterpoints||[]).forEach(function(link){
    const a=findById(link.a),b=findById(link.b),pivot=findById(link.pivot);
    if(!a||!b||!pivot||a.owner!==b.owner||disabled[a.id]||disabled[b.id]||disabled[pivot.id])return;
    add(a,b,"counterpoint",link.pivot);
  });
  return links;
}
function getToolLinks(disabled,counterpoints){
  const pieces=getPieces("tool"),links=[];
  const seen=new Set();
  function add(a,b,path){
    const key=[a.id,b.id].sort().join("|");
    if(seen.has(key))return;
    seen.add(key);
    links.push({a:a.id,b:b.id,ia:indexOfId(a.id),ib:indexOfId(b.id),path:path||"line"});
  }
  for(let i=0;i<pieces.length;i++){
    for(let j=i+1;j<pieces.length;j++){
      const a=pieces[i].piece,b=pieces[j].piece;
      if(a.owner!==b.owner||pieceRelation(a,b,"tool")!=="H")continue;
      if(disabled[a.id]||disabled[b.id])continue;
      if(lineClear(pieces[i].index,pieces[j].index)){
        add(a,b,"line");
      }
    }
  }
  (counterpoints||[]).forEach(function(link){
    const a=findById(link.a),b=findById(link.b),pivot=findById(link.pivot);
    if(!a||!b||!pivot||a.owner!==b.owner||disabled[a.id]||disabled[b.id]||disabled[pivot.id])return;
    add(a,b,"counterpoint");
  });
  return links;
}
function getMixedHarmonyLinks(fDisabled,tDisabled){
  const flowers=getPieces("flower"),tools=getPieces("tool"),links=[];
  flowers.forEach(function(flower){
    tools.forEach(function(tool){
      if(flower.piece.owner!==tool.piece.owner||mixedRelation(flower.piece.type,tool.piece.type)!=="H")return;
      if(fDisabled[flower.piece.id]||tDisabled[tool.piece.id])return;
      const diagonal=isDiagonal(flower.index,tool.index);
      if(!mixedHarmonyCanAlign(flower.piece.type,flower.index,tool.index))return;
      if(rockBlocksFlowerLine(flower.index,tool.index,diagonal)||!lineClear(flower.index,tool.index,[],diagonal))return;
      links.push({a:flower.piece.id,b:tool.piece.id,ia:flower.index,ib:tool.index,path:"line",diagonal:diagonal});
    });
  });
  return links;
}
function boardStatus(){
  const dis=refreshDissonance();
  const flowerLinks=getFlowerLinks(dis.fDisabled,dis.flowerD.counterpoints);
  const toolLinks=getToolLinks(dis.tDisabled,dis.toolD.counterpoints);
  const mixedLinks=getMixedHarmonyLinks(dis.fDisabled,dis.tDisabled);
  const status={flowerLinks:flowerLinks,toolLinks:toolLinks,mixedLinks:mixedLinks,flowerD:dis.flowerD.links,toolD:dis.toolD.links,mixedD:dis.mixedD.links,fDisabled:dis.fDisabled,tDisabled:dis.tDisabled};
  state.lastStatus=status;
  return status;
}
function positionKey(){
  const cells=state.board.map(function(piece){
    if(!piece)return null;
    const shieldIndex=piece.shieldTarget?state.board.findIndex(function(q){return q&&q.id===piece.shieldTarget}):-1;
    const bridge=(piece.bridgePair||[]).map(function(id){return state.board.findIndex(function(q){return q&&q.id===id})}).filter(function(i){return i>=0}).sort(function(a,b){return a-b});
    return [piece.type,piece.owner,piece.used?1:0,piece.mirrorActive?1:0,shieldIndex,bridge];
  });
  const types=Object.keys(DEFS);
  const reserves=state.reserves.map(function(owner){return types.map(function(type){return owner[type]||0})});
  const spent=state.reserveSpent.map(function(owner){return types.map(function(type){return owner[type]||0})});
  return JSON.stringify([state.current,cells,reserves,spent]);
}
function startRepetitionTracking(){
  state.repetitionCounts=Object.create(null);
  const key=positionKey();state.repetitionCounts[key]=1;state.lastRepetitionCount=1;
}
function recordCompletedPosition(){
  if(!state.repetitionCounts)state.repetitionCounts=Object.create(null);
  const key=positionKey(),count=(state.repetitionCounts[key]||0)+1;
  state.repetitionCounts[key]=count;state.lastRepetitionCount=count;return count;
}
function harmonyDisharmonyScore(status){
  const harmony=[0,0],dissonance=[0,0];
  status.flowerLinks.concat(status.toolLinks,status.mixedLinks).forEach(function(link){
    const a=findById(link.a),b=findById(link.b);
    if(a&&b&&a.owner===b.owner)harmony[a.owner]++;
  });
  status.flowerD.concat(status.toolD,status.mixedD).forEach(function(link){
    const a=findById(link.a),b=findById(link.b),owners=new Set();
    if(a)owners.add(a.owner);if(b)owners.add(b.owner);
    owners.forEach(function(owner){dissonance[owner]++});
  });
  return {harmony:harmony,dissonance:dissonance};
}
function compareHarmonyRatios(scores){
  function ratio(owner){
    const h=scores.harmony[owner],d=scores.dissonance[owner];
    if(d===0)return h>0?Infinity:0;
    return h/d;
  }
  const a=ratio(0),b=ratio(1);
  return a>b?1:a<b?-1:0;
}
function displayHarmonyRatio(harmony,dissonance){
  if(dissonance===0)return harmony>0?"∞":"0";
  return (harmony/dissonance).toFixed(2);
}
function adjudicateRepetition(status){
  const tally=harmonyDisharmonyScore(status),result=compareHarmonyRatios(tally);
  const ivory=displayHarmonyRatio(tally.harmony[0],tally.dissonance[0]);
  const indigo=displayHarmonyRatio(tally.harmony[1],tally.dissonance[1]);
  const detail="Ivory "+tally.harmony[0]+"H/"+tally.dissonance[0]+"D ("+ivory+") · Indigo "+tally.harmony[1]+"H/"+tally.dissonance[1]+"D ("+indigo+").";
  if(result===0){state.draw=true;state.winner=null;addLog("Threefold repetition. Harmony-to-Dissonance ratios tied; the game is a draw. "+detail,"win")}
  else{state.winner=result>0?0:1;state.draw=false;addLog("Threefold repetition. "+ownersName(state.winner)+" wins by the higher Harmony-to-Dissonance ratio. "+detail,"win")}
}
function getLink(status,a,b,group){
  const links=group==="flower"?status.flowerLinks:status.toolLinks;
  return links.find(function(l){return (l.a===a.id&&l.b===b.id)||(l.a===b.id&&l.b===a.id)});
}
function pointOnSegment(point,a,b){
  const cross=(point.y-a.y)*(b.x-a.x)-(point.x-a.x)*(b.y-a.y);
  return Math.abs(cross)<1e-9&&point.x>=Math.min(a.x,b.x)-1e-9&&point.x<=Math.max(a.x,b.x)+1e-9&&point.y>=Math.min(a.y,b.y)-1e-9&&point.y<=Math.max(a.y,b.y)+1e-9;
}
function segmentsIntersect(a,b,c,d){
  function orient(p,q,r){return (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x)}
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
  if(((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0)))return true;
  return Math.abs(o1)<1e-9&&pointOnSegment(c,a,b)||Math.abs(o2)<1e-9&&pointOnSegment(d,a,b)||Math.abs(o3)<1e-9&&pointOnSegment(a,c,d)||Math.abs(o4)<1e-9&&pointOnSegment(b,c,d);
}
function pointInsidePolygon(point,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];
    if(pointOnSegment(point,a,b))return false;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function simpleHarmonyLoop(points){
  if(points.length<3)return false;
  for(let i=0;i<points.length;i++){
    const nextI=(i+1)%points.length;
    for(let j=i+1;j<points.length;j++){
      const nextJ=(j+1)%points.length;
      if(j===nextI||nextJ===i)continue;
      if(segmentsIntersect(points[i],points[nextI],points[j],points[nextJ]))return false;
    }
  }
  return true;
}
function simpleFourFlowerLoop(points){
  return points.length===4&&simpleHarmonyLoop(points);
}
function validHarmonyRings(status){
  const pieces=getPieces(),byId=Object.create(null),neighbors=Object.create(null),rings=[];
  pieces.forEach(function(q){byId[q.piece.id]=q;neighbors[q.piece.id]=new Set()});
  status.flowerLinks.concat(status.toolLinks,status.mixedLinks).forEach(function(link){
    const a=byId[link.a],b=byId[link.b];
    if(!a||!b||a.piece.owner!==b.piece.owner)return;
    neighbors[link.a].add(link.b);neighbors[link.b].add(link.a);
  });
  [0,1].forEach(function(owner){
    const vertices=pieces.filter(function(q){return q.piece.owner===owner}).sort(function(a,b){return a.index-b.index});
    vertices.forEach(function(start){
      function extend(path){
        const last=path[path.length-1];
        if(path.length>=3&&neighbors[last.piece.id].has(start.piece.id)&&path[1].index<last.index){
          const points=path.map(function(q){return q.pos});
          if(simpleHarmonyLoop(points))rings.push({owner:owner,cells:path.map(function(q){return q.index}),pieces:path.map(function(q){return q.piece}),points:points,center:pointInsidePolygon({x:CENTER,y:CENTER},points)});
        }
        if(path.length>=vertices.length)return;
        neighbors[last.piece.id].forEach(function(id){
          const next=byId[id];
          if(!next||next.piece.owner!==owner||next.index<=start.index||path.some(function(q){return q.piece.id===id}))return;
          path.push(next);extend(path);path.pop();
        });
      }
      extend([start]);
    });
  });
  return rings;
}
function resolveCapturesAndWin(){
  let status=boardStatus();
  let rings=validHarmonyRings(status);
  const toRemove=new Set();
  rings.forEach(function(r){
    state.board.forEach(function(p,index){
      if(p&&p.owner!==r.owner&&pointInsidePolygon(xy(index),r.points))toRemove.add(p.id);
    });
  });
  if(toRemove.size){
    toRemove.forEach(function(id){clearSpecialEffectsOnMove(id)});
    const removed=[];
    state.board=state.board.map(function(p){
      if(p&&toRemove.has(p.id)){removed.push(p);state.captured[p.owner].push(p.type);returnToReserve(p);return null}
      return p;
    });
    removed.forEach(function(p){addLog(ownersName(1-p.owner)+" captured "+DEFS[p.type].short+" inside a Harmony loop; it returns to "+ownersName(p.owner)+"'s reserve.","capture")});
    status=boardStatus();
    rings=validHarmonyRings(status);
  }
  const wins=[false,false];
  rings.forEach(function(r){if(r.center)wins[r.owner]=true});
  if(wins[0]&&wins[1]){state.draw=false;state.winner=state.current;addLog("Both players completed center rings at once. "+ownersName(state.current)+" wins the tie by taking the center.","win")}
  else if(wins[0]||wins[1]){state.winner=wins[0]?0:1;const winningRing=rings.find(function(r){return r.owner===state.winner&&r.center});addLog(ownersName(state.winner)+" captured the center with a "+winningRing.pieces.length+"-piece Harmony ring.","win")}
  state.lastStatus=status;
  return status;
}
function commitOnlineAction(){
  const action=engineActionIntent;
  engineActionIntent=null;
  if(!onlineGameId||!onlineSocket||!action||applyingOnlineState)return;
  onlinePending=true;
  onlineSocket.emit("fourfold-gardenAction",{gameId:onlineGameId,action:clone(action)});
  render(state.lastStatus||boardStatus());
}
function tokenTitle(piece,status){
  const d=DEFS[piece.type],isD=d.group==="flower"?status.fDisabled[piece.id]:status.tDisabled[piece.id];
  const links=(d.group==="flower"?status.flowerLinks:status.toolLinks).concat(status.mixedLinks).filter(function(link){return link.a===piece.id||link.b===piece.id}).length;
  const ownerName=ownersName(piece.owner);
  const displayOwner=ownerName===PLAYER_NAMES[piece.owner]?uiText(ownerName):ownerName;
  const extras=[];
  if(isD)extras.push(uiText("Dissonant / jammed"));
  if(links)extras.push(uiText("Harmony links: "+links));
  if(isShielded(piece))extras.push(uiText("Shielded until the Lotus or target moves"));
  if(piece.type==="mirror"&&piece.mirrorActive)extras.push(uiText("Mirror active until it moves"));
  if(d.ability&&!piece.used)extras.push(uiText("Ability unused"));
  if(d.ability&&piece.used)extras.push(uiText("Ability spent"));
  return displayOwner+" "+uiText(d.name)+(extras.length?" · "+extras.join(" · "):"")+" — "+uiText(d.desc);
}
function harmonyMarkerDescription(type){
  const colors=PIECE_AFFINITIES[type]||[];
  return uiText("Harmony color markers")+": "+colors.map(function(color){return uiText(color[0].toUpperCase()+color.slice(1))}).join(", ");
}
function appendHarmonyMarkers(container,type){
  const colors=PIECE_AFFINITIES[type]||[];
  if(!container||!colors.length)return;
  const markers=document.createElement("span");markers.className="piece-affinity-dots";markers.dataset.count=String(colors.length);markers.setAttribute("aria-hidden","true");
  colors.forEach(function(color){const dot=document.createElement("i");dot.className="piece-affinity-dot";dot.style.setProperty("--affinity-color",AFFINITY_COLORS[color]);markers.appendChild(dot)});
  container.appendChild(markers);
}

function renderBoard(status,mandatoryAbilityActions){
  const board=document.getElementById("board");
  board.innerHTML="";
  // Resolve taps by the nearest lattice point instead of relying on tiny
  // overlapping browser hit boxes. This keeps mouse, touch, and pen input
  // consistent even when the board is scaled down on a phone.
  if(!board.dataset.pointInputBound){
    board.dataset.pointInputBound="true";
    let pointerStart=null;
    function nearestPointAt(clientX,clientY){
      const bounds=board.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return null;
      const stepX=bounds.width/(SIZE+1),stepY=bounds.height/(SIZE+1);
      const x=Math.round((clientX-bounds.left)/stepX)-1,y=Math.round((clientY-bounds.top)/stepY)-1;
      if(x<0||y<0||x>=SIZE||y>=SIZE)return null;
      const centerX=bounds.left+(x+1)*stepX,centerY=bounds.top+(y+1)*stepY;
      if(Math.abs(clientX-centerX)>Math.max(22,stepX*.48)||Math.abs(clientY-centerY)>Math.max(22,stepY*.48))return null;
      return playableAt(x,y)?idx(x,y):null;
    }
    board.addEventListener("pointerdown",function(event){
      if(event.button!==0||event.isPrimary===false)return;
      pointerStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
    },{passive:true});
    board.addEventListener("pointercancel",function(){pointerStart=null});
    board.addEventListener("pointerup",function(event){
      if(!pointerStart||pointerStart.pointerId!==event.pointerId||event.button!==0||event.isPrimary===false)return;
      const start=pointerStart;pointerStart=null;
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;
      const index=nearestPointAt(event.clientX,event.clientY);
      if(index===null)return;
      event.preventDefault();handlePoint(index);
    },{passive:false});
  }
  const harmonyIds=new Set();
  status.flowerLinks.concat(status.toolLinks,status.mixedLinks).forEach(function(link){harmonyIds.add(link.a);harmonyIds.add(link.b)});
  const ns="http://www.w3.org/2000/svg";
  function artNode(tag,attrs,parent){
    const node=document.createElementNS(ns,tag);
    Object.keys(attrs).forEach(function(key){node.setAttribute(key,String(attrs[key]))});
    if(parent)parent.appendChild(node);
    return node;
  }
  const art=document.createElementNS(ns,"svg");
  art.setAttribute("class","board-art");art.setAttribute("viewBox","0 0 1200 1200");art.setAttribute("preserveAspectRatio","none");
  const defs=artNode("defs",{},art),clip=artNode("clipPath",{id:"boardCircleClip"},defs);
  artNode("circle",{cx:600,cy:600,r:600},clip);
  artNode("circle",{cx:600,cy:600,r:600,fill:"#b9ae8e",stroke:"#64583e","stroke-width":8},art);
  const field=artNode("g",{"clip-path":"url(#boardCircleClip)"},art);
  const gardens=[
    {points:"600,600 600,100 100,600",fill:"#eee6d0"},
    {points:"600,600 1100,600 600,100",fill:"#d18470"},
    {points:"600,600 600,1100 100,600",fill:"#d18470"},
    {points:"600,600 1100,600 600,1100",fill:"#eee6d0"}
  ];
  gardens.forEach(function(g){artNode("polygon",{points:g.points,fill:g.fill,stroke:"#79634b","stroke-width":5},field)});
  const gates=[
    "600,18 582,58 618,58",
    "1182,600 1142,582 1142,618",
    "600,1182 618,1142 582,1142",
    "18,600 58,618 58,582"
  ];
  gates.forEach(function(points){artNode("polygon",{points:points,fill:"#c86e5d",stroke:"#784536","stroke-width":5},field)});
  for(let n=1;n<=11;n++){
    const v=n*100;
    artNode("line",{x1:v,y1:0,x2:v,y2:1200,stroke:"#5b513c","stroke-width":3,opacity:.66},field);
    artNode("line",{x1:0,y1:v,x2:1200,y2:v,stroke:"#5b513c","stroke-width":3,opacity:.66},field);
  }
  artNode("polygon",{points:"600,100 1100,600 600,1100 100,600",fill:"none",stroke:"#6f5942","stroke-width":8},field);
  artNode("circle",{cx:600,cy:600,r:600,fill:"none",stroke:"#64583e","stroke-width":8},art);
  board.appendChild(art);

  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("class","ray-layer");svg.setAttribute("viewBox","0 0 1200 1200");svg.setAttribute("preserveAspectRatio","none");
  function coord(i){const p=xy(i);return {x:(p.x+1)*100,y:(p.y+1)*100}}
  function drawLine(link,cls){
    const A=coord(link.ia),B=coord(link.ib);
    if(link.path==="mirror"&&Number.isInteger(link.via)){
      const M=coord(link.via),bend=document.createElementNS(ns,"polyline");
      bend.setAttribute("points",A.x+","+A.y+" "+M.x+","+M.y+" "+B.x+","+B.y);bend.setAttribute("class","ray-mirror");svg.appendChild(bend);return;
    }
    const line=document.createElementNS(ns,"line");
    line.setAttribute("x1",A.x);line.setAttribute("y1",A.y);line.setAttribute("x2",B.x);line.setAttribute("y2",B.y);line.setAttribute("class",cls);svg.appendChild(line);
  }
  status.flowerLinks.forEach(function(l){drawLine(l,l.path==="counterpoint"?"ray-counterpoint":l.path==="bridge"?"ray-bridge":l.path==="bond"?"ray-bond":l.diagonal?"ray-h-diagonal":"ray-h")});
  status.flowerD.forEach(function(l){drawLine(l,"ray-d")});
  status.toolLinks.forEach(function(l){drawLine(l,l.path==="counterpoint"?"ray-counterpoint":"ray-tool")});
  status.toolD.forEach(function(l){drawLine(l,"ray-tool-d")});
  status.mixedLinks.forEach(function(l){drawLine(l,l.diagonal?"ray-mixed-diagonal":"ray-mixed")});
  status.mixedD.forEach(function(l){drawLine(l,"ray-mixed-d")});
  board.appendChild(svg);
  const requiredAbilitySources=new Set(mode==="ability"&&state.turnStage==="bonus"?(mandatoryAbilityActions||availableAbilityActions(state.current,status)).map(function(action){return action.source}):[]);
  for(let i=0;i<SIZE*SIZE;i++){
    const pos=xy(i);
    if(!playableAt(pos.x,pos.y))continue;
    const p=state.board[i],zones=regionsAt(pos.x,pos.y),region=regionAt(pos.x,pos.y);
    const button=document.createElement("button");
    button.type="button";button.className="point";
    button.style.left=(((pos.x+1)/12)*100)+"%";button.style.top=(((pos.y+1)/12)*100)+"%";
    button.dataset.index=String(i);
    const areaLabel=zones.filter(function(z){return z!=="center"}).join(" and ")||region;
    button.setAttribute("aria-label",areaLabel+" point "+(pos.x+1)+","+(pos.y+1)+(p?": "+ownersName(p.owner)+" "+DEFS[p.type].short:""));
    if(p)button.setAttribute("aria-label",button.getAttribute("aria-label")+" — "+harmonyMarkerDescription(p.type));
    if(p&&requiredAbilitySources.has(i)){
      button.classList.add("ability-required-source");
      button.setAttribute("aria-label",button.getAttribute("aria-label")+" — "+uiText("Required ability source"));
      button.title=uiText("Required ability source");
    }
    if(i===lastPoint)button.classList.add("last-move");
    if(pending&&pending.sourceIndex===i)button.classList.add("selected-target");
    if(mode==="pickup"&&p&&canPickUpPiece(p,state.current,true))button.classList.add("pickup-target");
    if(mode==="place"&&selectedType&&!p){const conflict=placementSightConflict(selectedType,i);if(conflict){const other=conflict.a.type===selectedType?conflict.b.type:conflict.a.type;button.classList.add("sight-forbidden");button.title="Forbidden "+conflict.rule.axis+" alignment with "+DEFS[other].short}}
    if(pending&&pending.kind==="thornDrop"){
      const target=findById(pending.targetId),ti=target?indexOfId(target.id):-1;
      if(ti>=0){const T=xy(ti),horizontal=T.y===xy(pending.sourceIndex).y,options=horizontal?[idx(T.x,T.y-1),idx(T.x,T.y+1)]:[idx(T.x-1,T.y),idx(T.x+1,T.y)];
        if(options.indexOf(i)>=0&&!state.board[i]&&playableAt(pos.x,pos.y))button.classList.add("selected-target");}
    }
    if(p){
      const token=document.createElement("span"),d=DEFS[p.type];
      token.className="token "+PLAYER_CLASSES[p.owner]+" "+d.group+" "+p.type;
      if(status.fDisabled[p.id]||status.tDisabled[p.id])token.classList.add("dissonant");
      if(harmonyIds.has(p.id))token.classList.add("harmonized");
      if(isShielded(p))token.classList.add("shielded");
      if(p.type==="mirror"&&p.mirrorActive)token.classList.add("mirror-active");
      if(d.ability&&p.used)token.classList.add("spent");
      const glyph=document.createElement("span");glyph.className="token-glyph";glyph.innerHTML=PIECE_ICONS[p.type]||"";glyph.setAttribute("aria-hidden","true");token.appendChild(glyph);appendHarmonyMarkers(token,p.type);token.title=tokenTitle(p,status)+" · "+harmonyMarkerDescription(p.type);
      button.appendChild(token);
    }
    // Keep native keyboard and assistive-technology activation. Pointer input
    // is handled by the board's nearest-point resolver above.
    button.addEventListener("click",function(event){if(event.detail===0)handlePoint(i)});
    board.appendChild(button);
  }
  const centerLabel=document.createElement("span");
  centerLabel.className="center-mark";board.appendChild(centerLabel);
}
function renderBank(group,status){
  const host=document.getElementById(group==="flower"?"flowerBank":"toolBank");
  const types=Object.keys(DEFS).filter(function(t){return DEFS[t].group===group&&DEFS[t].count>0});
  let wrap=host.querySelector(".bank-group"),label=wrap&&wrap.querySelector(".bank-label"),grid=wrap&&wrap.querySelector(".bank");
  if(!wrap||!label||!grid){
    host.textContent="";
    wrap=document.createElement("div");wrap.className="bank-group reserve-card";wrap.dataset.active="true";wrap.setAttribute("role","group");
    label=document.createElement("div");label.className="bank-label";label.id=group+"ReserveLabel";
    grid=document.createElement("div");grid.className="bank";grid.setAttribute("role","group");
    wrap.append(label,grid);host.appendChild(wrap);
  }
  wrap.dataset.owner=String(state.current);
  label.innerHTML="<span>"+uiText(group==="flower"?"Flower reserve":"Tool reserve")+"</span><span>"+types.reduce(function(n,t){return n+(state.reserves[state.current][t]||0)},0)+" left</span>";
  wrap.setAttribute("aria-labelledby",label.id);grid.setAttribute("aria-labelledby",label.id);
  const validTypes=new Set(types);
  Array.from(grid.querySelectorAll(".reserve-flower")).forEach(function(button){if(!validTypes.has(button.dataset.pieceType))button.remove()});
  types.forEach(function(type){
    const d=DEFS[type],count=state.reserves[state.current][type]||0,spent=Math.min(count,state.reserveSpent[state.current][type]||0),ready=count-spent;
    let button=grid.querySelector('.reserve-flower[data-piece-type="'+type+'"]');
    if(!button){
      button=document.createElement("button");button.type="button";button.dataset.pieceType=type;
      button.addEventListener("click",function(){const cancel=selectedType===type;selectedType=cancel?null:type;if(!cancel)setStatus("Place "+d.short,uiText("Tap an open board point to place this piece."));render()});
      grid.appendChild(button);
    }
    button.className="reserve-flower tile-card "+d.group+(selectedType===type?" active hand-item-active":"");
    button.setAttribute("aria-pressed",selectedType===type?"true":"false");
    button.disabled=count<=0||state.winner!==null||state.draw||state.turnStage!=="place"||mode!=="place"||humanInputLocked();
    button.title=uiText(d.name)+" — "+uiText(d.desc)+(d.ability?" "+uiText("Reserve: "+ready+" ready, "+spent+" spent."):"")+" "+harmonyMarkerDescription(type);
    button.setAttribute("aria-label",uiText(d.name)+" — "+uiText(count+" in reserve")+" — "+harmonyMarkerDescription(type));
    button.innerHTML='<div class="tile-glyph">'+(PIECE_ICONS[type]||d.glyph)+'</div><div class="tile-name">'+uiText(d.short)+'</div><div class="tile-count">× '+count+(d.ability?' · '+ready+' ready':'')+'</div>';
    appendHarmonyMarkers(button.querySelector(".tile-glyph"),type);
  });
}
function renderLog(){
  const host=document.getElementById("log");host.innerHTML="";
  state.log.slice(0,12).forEach(function(entry){
    const div=document.createElement("div");div.className="log-entry "+(entry.kind||"");div.textContent=uiText(entry.text);host.appendChild(div);
  });
}
function renderHarmonyScore(status){
  const host=document.getElementById("harmonyScore");if(!host)return;
  const tally=harmonyDisharmonyScore(status),repeat=state.lastRepetitionCount||1;
  const playerLine=function(owner,cls){
    return '<span class="'+cls+'"><strong>'+ownersName(owner)+':</strong> '+tally.harmony[owner]+'H ÷ '+tally.dissonance[owner]+'D = '+displayHarmonyRatio(tally.harmony[owner],tally.dissonance[owner])+'</span>';
  };
  host.innerHTML='<div><strong>Harmony / Dissonance</strong> · last completed position repeated '+repeat+'/3 times</div><div class="score-lines">'+playerLine(0,"p0")+playerLine(1,"p1")+'</div>';
}
function render(status){
  if(typeof document==="undefined"||!document.getElementById("board"))return;
  status=status||boardStatus();
  state.lastStatus=status;
  const current=state.current;
  const placeStage=state.turnStage==="place",bonusStage=state.turnStage==="bonus",pickupStage=state.turnStage==="pickup"||state.turnStage==="pickupRequired",pickupRequiredStage=state.turnStage==="pickupRequired";
  const mandatoryAbilities=bonusStage?availableAbilityActions(current,status):[],abilityRequired=mandatoryAbilities.length>0;
  if(bonusStage&&!pending){if(abilityRequired&&mode!=="ability")mode="ability";else if(!abilityRequired&&mode==="ability")mode="bonus"}
  const pill=document.getElementById("turnPill");pill.className="turn-pill p"+current;pill.textContent=ownersName(current)+(state.winner!==null?" wins":state.draw?" · draw":placeStage?" · place":pickupStage?" · required pickup":" · bonus action");
  document.getElementById("placeMode").classList.toggle("active",mode==="place");
  document.getElementById("pickupMode").classList.toggle("active",mode==="pickup");
  document.getElementById("placeMode").disabled=humanInputLocked()||!placeStage;
  document.getElementById("pickupMode").disabled=humanInputLocked()||(!bonusStage&&!pickupStage)||(bonusStage&&abilityRequired);
  document.getElementById("pickupMode").textContent=pickupStage?"Pick up (required)":"Pick up yours";
  const finishTurnUnavailable=humanInputLocked()||!bonusStage||abilityRequired||state.lastPlacementFinalReserve;
  const finishTurnButton=document.getElementById("finishTurnBtn");
  finishTurnButton.hidden=finishTurnUnavailable;
  finishTurnButton.disabled=finishTurnUnavailable;
  document.getElementById("undoBtn").disabled=!undoState||humanInputLocked()||!!onlineGameId;
  document.getElementById("pauseBotBtn").hidden=opponentMode!=="watch";
  document.getElementById("pauseBotBtn").textContent=botPaused?"Resume bot match":"Pause bot match";
  document.getElementById("botNote").textContent=opponentMode==="watch"&&botPaused?"Bot match paused. Resume to continue watching. "+botOpeningNote():botOpeningNote();
  document.getElementById("resetBtn").disabled=!!onlineGameId;
  const onlineStatus=document.getElementById("onlineStatus");
  const createOnline=document.getElementById("onlineCreateBtn");
  const copyInvite=document.getElementById("copyInviteBtn");
  const resign=document.getElementById("resign-button");
  if(createOnline)createOnline.hidden=!!onlineGameId;
  if(copyInvite)copyInvite.hidden=!onlineGameId;
  if(resign)resign.hidden=!onlineGameId||state.winner!==null||state.draw;
  if(onlineStatus&&onlineGameId){
    onlineStatus.textContent=!onlineConnected?"Connecting to the online table…":!state.started?"Waiting for another player. Copy the invite link to share this table.":onlinePending?"Submitting move…":onlineSeat===state.current?"Your online turn.":"Waiting for the other player.";
  }
  if(state.winner!==null||state.draw){
    setStatus(state.draw?"Draw":ownersName(state.winner)+" wins",state.log.length?state.log[0].text:(state.draw?"Both players completed a center ring at once.":"The game has ended."));
  }else if(botThinking&&isBotTurn()){
    setStatus(ownersName(current)+" bot is thinking…","The bot is checking Harmony lines, Dissonance, and center-ring threats.");
  }else if(botPaused&&opponentMode==="watch"){
    setStatus("Bot match paused","Resume the match when you want to keep watching.");
  }else if(isBotTurn()){
    setStatus(ownersName(current)+" bot to move",placeStage?"The bot must place a reserve piece first.":pickupStage?"The bot must pick up one of its own pieces this turn.":abilityRequired?"The bot must use one of its legal active abilities before ending the turn.":"The bot may pick up one of its own pieces or finish the turn.");
  }else if(pickupStage){
    setStatus(ownersName(current)+" must pick up",pickupRequiredStage?"Your last reserve piece is on the board. Pick up one of your own pieces to return it to reserve, then your turn ends.":"No reserve pieces remain. Pick up one of your own pieces to return it to reserve; this is your whole turn.");
  }else if(pending){
    setStatus("Ability: "+DEFS[pending.sourceType].short,pending.message);
  }else if(abilityRequired){
    setStatus(ownersName(current)+" must use an ability","Choose one highlighted friendly piece with a legal active ability, then follow the target prompt.");
  }else if(mode==="pickup"){
    setStatus("Pick up your piece","Click one of your own pieces to return it to your reserve.");
  }else if(selectedType){
    setStatus("Place "+DEFS[selectedType].short,uiText("Tap an open board point to place this piece."));
  }else if(bonusStage){
    setStatus(ownersName(current)+" optional action","No legal active ability is available. You may pick up one of your own pieces or finish the turn.");
  }else{
    setStatus(ownersName(current)+" must place","Choose a piece from your reserve and place it on an open point first.");
  }
  const selectedNote=document.getElementById("selectedNote");
  if(pickupStage){
    selectedNote.textContent=pickupRequiredStage?"Last reserve piece placed. Pick up one of your own pieces to return it to reserve; this ends your turn.":"No reserve pieces remain. Pick up one of your own pieces to return it to reserve; this is your whole turn.";
  }else if(abilityRequired){
    selectedNote.textContent="Required action: activate one highlighted friendly piece with a legal active ability. Passive-only pieces cannot be activated.";
  }else if(mode==="pickup"){
    selectedNote.textContent="Click one of your own pieces to return it to reserve. The piece placed this turn is protected unless it is your only piece on the board.";
  }else if(selectedType){
    selectedNote.textContent=uiText("Selected: "+DEFS[selectedType].name+". Tap an open board point to place it; crossed-out points are forbidden.");
  }else if(bonusStage){
    selectedNote.textContent="Your piece is placed. No legal active ability is available, so you may pick up one of your own pieces or finish the turn.";
  }else{
    selectedNote.textContent="Select a reserve piece and place it first. If a legal active ability is available afterward, you must use it before ending the turn.";
  }
  renderBoard(status,mandatoryAbilities);
  renderHarmonyScore(status);
  renderBank("flower",status);renderBank("tool",status);renderLog();
  if(state.winner!==null||state.draw){
    document.getElementById("modalTitle").textContent=state.draw?"A balanced garden":ownersName(state.winner)+" wins";
    document.getElementById("modalText").textContent=state.log.length?state.log[0].text:(state.draw?"The game ended in a draw.":"The game has ended.");
    document.getElementById("modalBackdrop").classList.add("show");
  }else document.getElementById("modalBackdrop").classList.remove("show");
  scheduleBotTurn();
}
function snapshot(){if(state.turnStage==="place"||state.turnStage==="pickup"||!undoState)undoState=clone(state)}
function centralHarmonyScore(status){
  const score=[0,0];
  status.flowerLinks.concat(status.mixedLinks).forEach(function(link){
    const a=findById(link.a),b=findById(link.b);
    if(!a||!b)return;
    const A=xy(indexOfId(a.id)),B=xy(indexOfId(b.id));
    if((Math.abs(A.x-CENTER)<=2&&Math.abs(A.y-CENTER)<=2)||(Math.abs(B.x-CENTER)<=2&&Math.abs(B.y-CENTER)<=2))score[a.owner]++;
  });
  return score;
}
function finishTurn(status){
  if(state.winner!==null||state.draw){render(state.lastStatus||status);return}
  const actor=state.current;
  state.turnCounts[actor]++;state.ply++;state.current=1-actor;
  state.turnStage=hasReservePieces(state.current)?"place":"pickup";
  state.turnPlacedId=null;state.lastPlacementFinalReserve=false;selectedType=null;pending=null;mode=state.turnStage==="pickup"?"pickup":"place";
  const resolved=status||resolveCapturesAndWin();
  if(state.winner!==null||state.draw){render(resolved);return}
  if(recordCompletedPosition()>=3)adjudicateRepetition(resolved);
  render(resolved);
}
function finishAction(message,kind){
  const actor=state.current;
  addLog(ownersName(actor)+" "+message,kind||"");
  state.passes=0;
  const status=resolveCapturesAndWin();
  if(state.winner!==null||state.draw){render(status);commitOnlineAction();return}
  if(state.turnStage==="place"){
    const mustPickup=state.lastPlacementFinalReserve||!hasReservePieces(actor);
    const mandatoryAbilities=availableAbilityActions(actor,status);
    if(mandatoryAbilities.length){
      state.turnStage="bonus";selectedType=null;pending=null;mode="ability";
    }else if(mustPickup){
      state.lastPlacementFinalReserve=false;
      if(!hasOwnedBoardPiece(actor)){
        addLog(ownersName(actor)+" had no piece left on the board after the placement was captured; the captured piece returned to reserve, so the turn ends.","pickup");
        finishTurn(status);commitOnlineAction();return;
      }
      state.turnStage="pickupRequired";selectedType=null;pending=null;mode="pickup";
    }else{
      state.lastPlacementFinalReserve=false;
      state.turnStage="bonus";selectedType=null;pending=null;mode="bonus";
    }
    render(status);commitOnlineAction();return;
  }
  if(state.turnStage==="bonus"&&engineActionIntent?.kind==="ability"&&state.lastPlacementFinalReserve){
    state.lastPlacementFinalReserve=false;
    if(hasOwnedBoardPiece(actor)){
      state.turnStage="pickupRequired";selectedType=null;pending=null;mode="pickup";
      render(status);commitOnlineAction();return;
    }
  }
  finishTurn(status);
  commitOnlineAction();
}
function placePiece(type,index){
  const pos=xy(index);
  if(!playableAt(pos.x,pos.y)){setStatus("Outside the board","Choose a point inside the circular playing field.");return}
  if(state.board[index]){setStatus("Point is occupied","Choose an empty point.");return}
  const conflict=placementSightConflict(type,index);
  if(conflict){const other=conflict.a.type===type?conflict.b.type:conflict.a.type;setStatus("Forbidden alignment",DEFS[type].short+" cannot share a "+conflict.rule.axis+" alignment with "+DEFS[other].short+". Blockers do not cancel this rule.");render();return}
  if((state.reserves[state.current][type]||0)<=0){setStatus("No copies left","Choose another piece.");return}
  snapshot();
  const d=DEFS[type],used=takeFromReserve(state.current,type),piece={id:"p"+state.nextId++,type:type,owner:state.current,used:used,bridgePair:null,mirrorActive:false,shieldTarget:null};
  state.board[index]=piece;
  recordBotPlacement(state.current,type,index);
  state.lastPlacementFinalReserve=!hasReservePieces(state.current);
  state.turnPlacedId=piece.id;
  lastPoint=index;
  engineActionIntent={kind:"place",type:type,index:index};
  finishAction("placed "+d.short+" at "+(xy(index).x+1)+","+(xy(index).y+1)+".","");
}
function sourceAbility(piece){
  const d=DEFS[piece.type];
  if(!d.ability)return "This piece has a passive effect, not an activated ability.";
  if(piece.used)return "This piece has already used its ability.";
  const status=state.lastStatus||boardStatus();
  const disabled=isFlower(piece)?status.fDisabled[piece.id]:status.tDisabled[piece.id];
  const worksThroughDissonance=piece.type==="bell";
  if(disabled&&!worksThroughDissonance)return "This piece is dissonant and cannot activate its ability.";
  return null;
}
function selectAbilitySource(index){
  if(state.turnStage!=="bonus"){setStatus("Ability unavailable","Place a reserve piece before using an active ability.");return}
  const p=state.board[index];
  if(!p||p.owner!==state.current){setStatus("Choose your own piece","Only the current player can activate their own piece.");return}
  const problem=sourceAbility(p);
  if(problem){setStatus(DEFS[p.type].short,problem);return}
  if(!availableAbilityActions(state.current,state.lastStatus||boardStatus()).some(function(action){return action.source===index})){
    setStatus("No legal active ability","Choose a friendly ability piece with a legal action.");render();return;
  }
  engineActionIntent={kind:"ability",source:index,targets:[]};
  if(p.type==="wheel"){snapshot();if(rotateWheel(index)){p.used=true;lastPoint=index;finishAction("used Wheel to rotate its surrounding tiles.","")}else{engineActionIntent=null;setStatus("Wheel has no legal rotation","The ring must be complete, contain no Rock, and avoid prohibited alignments.");render()}return}
  if(p.type==="mirror"){snapshot();p.used=true;p.mirrorActive=true;lastPoint=index;finishAction("activated Mirror; its right-angle reflection stays active while it remains here.","");return}
  if(p.type==="bridge"){pending={kind:"bridgeA",sourceId:p.id,sourceType:p.type,sourceIndex:index,message:"Choose the first friendly flower for the Bridge link."};render();return}
  pending={kind:p.type==="boat"?"boatPick":p.type==="fan"?"fanDirection":p.type==="bell"?"bellTarget":p.type==="whiteLotus"?"lotusTarget":p.type==="orchid"?"orchidTarget":"thornTarget",sourceId:p.id,sourceType:p.type,sourceIndex:index,message:p.type==="bell"?"Click an enemy tile to pull it toward the Bell.":"Choose a legal target on the board."};
  render();
}
function findById(id){return state.board.find(function(p){return p&&p.id===id})||null}
function indexOfId(id){return state.board.findIndex(function(p){return p&&p.id===id})}
function rotateWheel(centerIndex){
  const c=xy(centerIndex),positions=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
    const x=c.x+dx,y=c.y+dy;if(inBounds(x,y))positions.push({x:x,y:y,dx:dx,dy:dy});
  }
  if(positions.length!==8)return false;
  const original=state.board,old=positions.map(function(p){return original[idx(p.x,p.y)]}),next=original.slice();
  if(old.every(function(p){return !p}))return false;
  if(old.some(function(p){return p&&p.type==="rock"}))return false;
  positions.forEach(function(p){next[idx(p.x,p.y)]=null});
  positions.forEach(function(p,n){
    const piece=old[n];if(!piece)return;
    let nx=c.x+(p.y-c.y),ny=c.y-(p.x-c.x);
    if(!inBounds(nx,ny)){nx=p.x;ny=p.y}
    const target=idx(nx,ny);
    if(next[target])next[idx(p.x,p.y)]=piece;
    else next[target]=piece;
  });
  if(forbiddenSightConflict(next))return false;
  old.forEach(function(piece){if(piece)clearSpecialEffectsOnMove(piece)});
  state.board=next;
  return true;
}
function getPendingSource(){return findById(pending.sourceId)}
function handlePoint(index){
  if(state.winner!==null||state.draw||humanInputLocked())return;
  if(pending){handlePending(index);return}
  if(state.turnStage==="pickup"||state.turnStage==="pickupRequired"){
    const piece=state.board[index];
    if(!piece||piece.owner!==state.current){setStatus("Choose your own piece","You must pick up one of your own pieces on this turn.");return}
    if(!canPickUpPiece(piece,state.current,state.turnStage==="pickupRequired")){setStatus("Choose another piece","The piece just placed can only be picked up if it is your only piece on the board.");return}
    snapshot();clearSpecialEffectsOnMove(piece);state.board[index]=null;returnToReserve(piece);state.pickedUp[state.current].push(piece.type);lastPoint=index;engineActionIntent={kind:"pickup",index:index};
    finishAction("was required to pick up own "+DEFS[piece.type].short+" and return it to reserve.","pickup");return;
  }
  if(state.turnStage==="place"){
    if(mode!=="place"){setStatus("Place first","Every turn begins with a reserve piece placement.");return}
    if(!selectedType){setStatus("Choose a piece first","Select a tile from the reserve.");return}
    placePiece(selectedType,index);return;
  }
  if(mode==="pickup"){
    if(state.turnStage==="bonus"&&availableAbilityActions(state.current,state.lastStatus||boardStatus()).length){
      mode="ability";setStatus("Ability required","Use a legal active ability before picking up or ending your turn.");render();return;
    }
    const piece=state.board[index];
    if(!piece){setStatus("Choose your own piece","Click one of your own pieces to remove it.");return}
    if(piece.owner!==state.current){setStatus("That piece belongs to your opponent","You may only pick up one of your own pieces.");return}
    if(!canPickUpPiece(piece,state.current,true)){setStatus("Keep this turn's placement","You may only pick up the piece you just placed if it is your only piece on the board.");return}
    clearSpecialEffectsOnMove(piece);
    state.board[index]=null;returnToReserve(piece);state.pickedUp[state.current].push(piece.type);lastPoint=index;engineActionIntent={kind:"pickup",index:index};
    finishAction("picked up own "+DEFS[piece.type].short+" and returned it to reserve.","");return;
  }
  if(mode==="ability"){
    const p=state.board[index];
    if(!p){setStatus("Choose a piece","Click one of your own ability pieces.");return}
    selectAbilitySource(index);return;
  }
  setStatus("Choose a bonus action","Use one ability, pick up one of your own pieces, or finish the turn.");
}
function handlePending(index){
  const source=getPendingSource();
  if(!source){pending=null;render();return}
  const target=state.board[index],pos=xy(index),srcIndex=indexOfId(source.id),src=xy(srcIndex),actor=state.current;
  if(pending.kind==="bridgeA"){
    if(!target||target.owner!==actor||!isFlower(target)){setStatus("Bridge target","Choose one of your flowers.");return}
    engineActionIntent?.targets.push(index);
    pending={kind:"bridgeB",sourceId:source.id,sourceType:source.type,sourceIndex:srcIndex,aId:target.id,message:"Choose a compatible flower on the same row or column, with the Bridge between them."};render();return;
  }
  if(pending.kind==="bridgeB"){
    const a=findById(pending.aId);
    if(!a||!target||target.owner!==actor||!isFlower(target)||target.id===a.id||pieceRelation(a,target,"flower")!=="H"){
      setStatus("Invalid Bridge pair","Choose a different friendly flower that harmonizes with the first.");return;
    }
    const ai=indexOfId(a.id),bi=indexOfId(target.id);
    if(!isAligned(ai,bi)||!pointBetween(srcIndex,ai,bi)){setStatus("Bridge must lie between","Both flowers and the Bridge must share a row or column.");return}
    engineActionIntent?.targets.push(index);
    snapshot();source.bridgePair=[a.id,target.id];source.used=true;lastPoint=srcIndex;pending=null;
    finishAction("used Bridge to connect "+DEFS[a.type].short+" and "+DEFS[target.type].short+"; the marked link lasts while all three pieces stay put.","");return;
  }
  if(pending.kind==="boatPick"){
    const neutral=regionAt(src.x,src.y)==="neutral"?1:0,range=1+neutral;
    if(!target||!isFlower(target)||chebyshev(srcIndex,index)>range){setStatus("Choose a Flower in range","Boat range is 1 point, or 2 if the Boat sits in Neutral.");return}
    engineActionIntent?.targets.push(index);
    pending={kind:"boatDrop",sourceId:source.id,sourceType:source.type,sourceIndex:srcIndex,targetId:target.id,message:"Choose an empty destination within the Boat's fixed range."};render();return;
  }
  if(pending.kind==="boatDrop"){
    const flower=findById(pending.targetId),neutral=regionAt(src.x,src.y)==="neutral"?1:0,range=1+neutral;
    if(!flower){setStatus("Boat target moved","Choose the Boat ability again.");return}
    if(state.board[index]||chebyshev(srcIndex,index)>range){setStatus("Choose an empty point in range","Boat range is 1 point, or 2 if the Boat sits in Neutral.");return}
    if(!movementPreservesSight(indexOfId(flower.id),index)){setStatus("Forbidden alignment","Boat cannot carry that Flower into a prohibited alignment.");return}
    engineActionIntent?.targets.push(index);
    snapshot();clearSpecialEffectsOnMove(flower);state.board[index]=flower;state.board[indexOfId(flower.id)]=null;source.used=true;lastPoint=index;pending=null;
    finishAction("used Boat to carry "+DEFS[flower.type].short+".","");return;
  }
  if(pending.kind==="fanDirection"){
    if(pos.x!==src.x&&pos.y!==src.y){setStatus("Choose a row or column","Click a point along a row or column from the Fan.");return}
    const dx=Math.sign(pos.x-src.x),dy=Math.sign(pos.y-src.y);
    if(dx===0&&dy===0){setStatus("Choose a direction","Select a point away from the Fan.");return}
    snapshot();
    const result=fanPush(srcIndex,dx,dy,source);
    if(!result){setStatus("Fan cannot push that line","It needs a contiguous line and one empty point beyond it. Rocks cannot move; push at most 3 tiles, or 4 from Neutral. A push cannot create a prohibited alignment.");render();return}
    engineActionIntent?.targets.push(index);
    source.used=true;lastPoint=srcIndex;pending=null;
    finishAction("used Fan to push "+result+" tile"+(result===1?"":"s")+".","");return;
  }
  if(pending.kind==="bellTarget"){
    const neutral=regionAt(src.x,src.y)==="neutral"?1:0,range=2+neutral;
    if(!target||target.owner===actor||target.type==="rock"){setStatus("Choose an enemy tile","Bell pulls an enemy tile along a clear row or column toward it. Rocks are anchored.");return}
    if(!isAligned(srcIndex,index)||Math.max(Math.abs(pos.x-src.x),Math.abs(pos.y-src.y))>range||!lineClear(srcIndex,index)){setStatus("Bell cannot reach","Target must be in a clear row or column within "+range+" points.");return}
    const dx=Math.sign(src.x-pos.x),dy=Math.sign(src.y-pos.y),nx=pos.x+dx,ny=pos.y+dy;
    if(!inBounds(nx,ny)||state.board[idx(nx,ny)]){setStatus("No room to pull","The point toward the Bell is occupied or off the board.");return}
    if(!movementPreservesSight(index,idx(nx,ny))){setStatus("Forbidden alignment","Bell cannot pull that tile into a prohibited alignment.");return}
    engineActionIntent?.targets.push(index);
    snapshot();clearSpecialEffectsOnMove(target);state.board[idx(nx,ny)]=target;state.board[index]=null;source.used=true;lastPoint=idx(nx,ny);pending=null;
    finishAction("used Bell to pull an enemy "+DEFS[target.type].short+".","");return;
  }
  if(pending.kind==="lotusTarget"){
    if(!target||!isFlower(target)||target.owner!==actor||chebyshev(srcIndex,index)>2){setStatus("Choose a friendly Flower within two points","White Lotus shields one friendly Flower; the shield ends when either piece moves.");return}
    engineActionIntent?.targets.push(index);
    snapshot();source.shieldTarget=target.id;source.used=true;lastPoint=index;pending=null;
    finishAction("used White Lotus to shield "+DEFS[target.type].short+".","");return;
  }
  if(pending.kind==="orchidTarget"){
    if(!target||!isFlower(target)||target.owner===actor||chebyshev(srcIndex,index)>1){setStatus("Choose an adjacent enemy Flower","Orchid pushes an adjacent enemy Flower one point directly away.");return}
    const nx=pos.x+Math.sign(pos.x-src.x),ny=pos.y+Math.sign(pos.y-src.y);
    if(!inBounds(nx,ny)||state.board[idx(nx,ny)]){setStatus("Orchid cannot push it","The point directly away from Orchid is occupied or outside the board.");return}
    if(!movementPreservesSight(index,idx(nx,ny))){setStatus("Forbidden alignment","Orchid cannot push that Flower into a prohibited alignment.");return}
    engineActionIntent?.targets.push(index);
    snapshot();clearSpecialEffectsOnMove(target);state.board[idx(nx,ny)]=target;state.board[index]=null;source.used=true;lastPoint=idx(nx,ny);pending=null;
    finishAction("used Orchid to push "+DEFS[target.type].short+" away one point.","");return;
  }
  if(pending.kind==="thornTarget"){
    if(!target||!isFlower(target)||target.owner===actor||!isAligned(srcIndex,index)||Math.max(Math.abs(pos.x-src.x),Math.abs(pos.y-src.y))>3||!lineClear(srcIndex,index)){
      setStatus("Thorn cannot reach","Choose an enemy Flower on a clear row or column within three points.");return;
    }
    engineActionIntent?.targets.push(index);
    const options=pos.y===src.y?[idx(pos.x,pos.y-1),idx(pos.x,pos.y+1)]:[idx(pos.x-1,pos.y),idx(pos.x+1,pos.y)];
    if(!options.some(function(i){const p=xy(i);return playableAt(p.x,p.y)&&!state.board[i]})){setStatus("No sideways opening","Thorn needs an empty point immediately beside the target.");return}
    pending={kind:"thornDrop",sourceId:source.id,sourceType:source.type,sourceIndex:srcIndex,targetId:target.id,message:"Choose one of the highlighted empty points to slide the Flower sideways."};render();return;
  }
  if(pending.kind==="thornDrop"){
    const flower=findById(pending.targetId);
    if(!flower){setStatus("Thorn target moved","Choose the ability again.");return}
    const fi=indexOfId(flower.id),fp=xy(fi),horizontal=fp.y===src.y,options=horizontal?[idx(fp.x,fp.y-1),idx(fp.x,fp.y+1)]:[idx(fp.x-1,fp.y),idx(fp.x+1,fp.y)];
    if(options.indexOf(index)<0||!playableAt(pos.x,pos.y)||state.board[index]){setStatus("Choose a highlighted empty point","Thorn slides one point perpendicular to the ray.");return}
    if(!movementPreservesSight(fi,index)){setStatus("Forbidden alignment","Thorn cannot slide that Flower into a prohibited alignment.");return}
    engineActionIntent?.targets.push(index);
    snapshot();clearSpecialEffectsOnMove(flower);state.board[index]=flower;state.board[fi]=null;source.used=true;lastPoint=index;pending=null;
    finishAction("used Thorn to slide "+DEFS[flower.type].short+" sideways.","");return;
  }
}

function fanPush(sourceIndex,dx,dy,source){
  const s=xy(sourceIndex),neutral=regionAt(s.x,s.y)==="neutral"?1:0,limit=3+neutral;
  let count=0,x=s.x+dx,y=s.y+dy,items=[];
  while(inBounds(x,y)&&state.board[idx(x,y)]&&count<limit){
    const p=state.board[idx(x,y)];if(p.type==="rock")return 0;
    items.push({p:p,i:idx(x,y)});count++;x+=dx;y+=dy;
  }
  if(!count||!inBounds(x,y)||state.board[idx(x,y)])return 0;
  const next=state.board.slice();
  for(let k=items.length-1;k>=0;k--){
    const item=items[k],old=xy(item.i),ni=idx(old.x+dx,old.y+dy);
    next[ni]=item.p;next[item.i]=null;
  }
  if(forbiddenSightConflict(next))return 0;
  items.forEach(function(item){clearSpecialEffectsOnMove(item.p)});
  state.board=next;
  return count;
}

function finishBonus(){
  if(state.winner!==null||state.draw||state.turnStage!=="bonus")return;
  if(availableAbilityActions(state.current,state.lastStatus||boardStatus()).length){
    mode="ability";pending=null;selectedType=null;setStatus("Ability required","Use a legal active ability before picking up or ending your turn.");render();return;
  }
  if(state.lastPlacementFinalReserve){
    state.lastPlacementFinalReserve=false;
    if(hasOwnedBoardPiece(state.current)){
      state.turnStage="pickupRequired";mode="pickup";pending=null;selectedType=null;render();return;
    }
  }
  if(!engineActionIntent)engineActionIntent={kind:"finish"};
  addLog(ownersName(state.current)+" finished the turn without a bonus action.","");
  finishTurn(state.lastStatus||resolveCapturesAndWin());
  commitOnlineAction();
}
function isBotOwner(owner){
  return opponentMode==="watch"||(opponentMode==="bot-indigo"&&owner===1)||(opponentMode==="bot-ivory"&&owner===0);
}
function isBotTurn(){return !!state&&isBotOwner(state.current)}
function humanInputLocked(){return botThinking||isBotTurn()||Boolean(onlineGameId&&(!onlineConnected||onlinePending||onlineSeat!==state?.current))}
function cancelScheduledBot(){
  if(botTimer!==null){clearTimeout(botTimer);botTimer=null}
  botThinking=false;
}
function botModeChanged(){
  if(onlineGameId)return;
  cancelScheduledBot();botPaused=false;
  opponentMode=document.getElementById("opponentMode").value;
  render();
}
function toggleBotPause(){
  if(opponentMode!=="watch")return;
  botPaused=!botPaused;
  if(botPaused)cancelScheduledBot();
  render();
}
function scheduleBotTurn(){
  if(!state||!isBotTurn()||botPaused||botThinking||state.winner!==null||state.draw)return;
  botThinking=true;
  render(state.lastStatus||boardStatus());
  botTimer=setTimeout(function(){
    botTimer=null;
    if(!isBotTurn()||botPaused||state.winner!==null||state.draw){botThinking=false;render();return}
    let action=null;
    try{action=chooseBotAction()}catch(error){console.error("Fourfold Garden bot error:",error)}
    if(action)executeBotAction(action);
    else if(state.turnStage==="bonus")finishBonus();
    else{setStatus("No legal placement","The game cannot continue from this position.");render()}
    botThinking=false;
    if(state.winner===null&&!state.draw)render(state.lastStatus||boardStatus());
  },botStepDelay);
}
function botPositionValue(index,group){
  const p=xy(index),dx=Math.abs(p.x-CENTER),dy=Math.abs(p.y-CENTER),distance=Math.max(dx,dy);
  if(group==="flower"){
    let value=Math.max(-1.2,3.8-distance*.48);
    if(dx>0&&dy>0&&dx<=5&&dy<=5)value+=1.05;
    if((dx===0||dy===0)&&distance<=5)value+=.35;
    return value;
  }
  return Math.max(-.45,1.5-distance*.2);
}
function counterpointPlacementBonus(type,index,owner){
  const group=DEFS[type].group,pivotType=group==="flower"?"peony":"knotweed",targetWeight=group==="flower"?14:6;
  const all=getPieces(group).filter(function(q){return q.piece.owner===owner});
  function opposite(a,b,center){
    const A=xy(a),B=xy(b),C=xy(center);
    return (A.x===C.x&&B.x===C.x&&(A.y-C.y)*(B.y-C.y)<0)||
      (A.y===C.y&&B.y===C.y&&(A.x-C.x)*(B.x-C.x)<0);
  }
  let pairs=0;
  if(type===pivotType){
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
      if(relation(type,all[i].piece.type,group)!=="D"||relation(type,all[j].piece.type,group)!=="D")continue;
      if(!opposite(all[i].index,all[j].index,index)||!lineClear(index,all[i].index)||!lineClear(index,all[j].index))continue;
      if(group==="flower"&&(rockBlocksFlowerLine(index,all[i].index)||rockBlocksFlowerLine(index,all[j].index)))continue;
      pairs++;
    }
  }else{
    all.forEach(function(pivot){
      if(pivot.piece.type!==pivotType||relation(type,pivot.piece.type,group)!=="D"||!lineClear(index,pivot.index))return;
      if(group==="flower"&&rockBlocksFlowerLine(index,pivot.index))return;
      all.forEach(function(other){
        if(other.piece.id===pivot.piece.id||relation(pivot.piece.type,other.piece.type,group)!=="D")return;
        if(!opposite(index,other.index,pivot.index)||!lineClear(pivot.index,other.index))return;
        if(group==="flower"&&rockBlocksFlowerLine(pivot.index,other.index))return;
        pairs++;
      });
    });
  }
  return Math.min(2,pairs)*targetWeight;
}
function recordBotPlacement(owner,type,index){
  if(!state.botPlacementHistory)state.botPlacementHistory=[[],[]];
  const history=state.botPlacementHistory[owner]||(state.botPlacementHistory[owner]=[]);
  history.push({type:type,index:index});
  if(history.length>12)history.splice(0,history.length-12);
}
let centerRingRectCache=null;
function centerRingRectangles(){
  if(centerRingRectCache)return centerRingRectCache;
  const all=[],byCorner=Array.from({length:SIZE*SIZE},function(){return []});
  for(let x1=0;x1<CENTER;x1++)for(let x2=CENTER+1;x2<SIZE;x2++)for(let y1=0;y1<CENTER;y1++)for(let y2=CENTER+1;y2<SIZE;y2++){
    const cells=[idx(x1,y1),idx(x2,y1),idx(x2,y2),idx(x1,y2)];
    if(cells.some(function(i){const p=xy(i);return !playableAt(p.x,p.y)}))continue;
    const rectangle={x1:x1,x2:x2,y1:y1,y2:y2,cells:cells};all.push(rectangle);
    cells.forEach(function(i){byCorner[i].push(rectangle)});
  }
  centerRingRectCache={all:all,byCorner:byCorner};
  return centerRingRectCache;
}
function trialCenterRingPlacementWins(owner,type,index){
  const previous=state,previousPoint=lastPoint;let wins=false;
  try{
    state=cloneBotSearchState(previous);state.current=owner;state.turnStage="place";state.turnPlacedId=null;state.lastPlacementFinalReserve=false;state.lastStatus=null;
    if(applyBotAction({kind:"place",type:type,index:index})){
      resolveCapturesAndWin();wins=state.winner===owner;
    }
  }catch(error){wins=false}
  finally{state=previous;lastPoint=previousPoint}
  return wins;
}
function centerRingWinningPlacements(owner){
  const ownPieces=getPieces().filter(function(q){return q.piece.owner===owner});
  if(ownPieces.length<2)return [];
  const status=boardStatus(),links=status.flowerLinks.concat(status.toolLinks,status.mixedLinks),types=Object.keys(DEFS).filter(function(type){return DEFS[type].count>0&&(state.reserves[owner][type]||0)>0});
  if(!types.length)return [];
  const byId=Object.create(null),neighbors=Object.create(null),paths=[],found=[],seen=new Set();
  ownPieces.forEach(function(q){byId[q.piece.id]=q;neighbors[q.piece.id]=[]});
  links.forEach(function(link){
    const a=byId[link.a],b=byId[link.b];
    if(!a||!b||a.piece.owner!==b.piece.owner)return;
    neighbors[a.piece.id].push(b);neighbors[b.piece.id].push(a);
    if(a.index<b.index)paths.push([a,b]);
  });
  ownPieces.forEach(function(middle){
    const linked=neighbors[middle.piece.id];
    for(let a=0;a<linked.length;a++)for(let c=a+1;c<linked.length;c++){
      const left=linked[a],right=linked[c];
      if(left.index>=right.index)continue;
      paths.push([left,middle,right]);
    }
  });
  paths.forEach(function(path){
    const first=path[0],last=path[path.length-1];
    for(let index=0;index<state.board.length;index++){
      const pos=xy(index);
      if(state.board[index]||!playableAt(pos.x,pos.y))continue;
      const points=path.map(function(q){return q.pos}).concat([pos]);
      if(!simpleHarmonyLoop(points)||!pointInsidePolygon({x:CENTER,y:CENTER},points))continue;
      types.forEach(function(type){
        function canCloseTo(partner){
          const candidateGroup=DEFS[type].group,partnerGroup=DEFS[partner.piece.type].group;
          const rel=candidateGroup===partnerGroup?relation(type,partner.piece.type,candidateGroup):candidateGroup==="flower"?mixedRelation(type,partner.piece.type):mixedRelation(partner.piece.type,type);
          const flowerType=candidateGroup==="flower"?type:partner.piece.type,diagonal=isDiagonal(index,partner.index);
          if(rel!=="H")return false;
          if(diagonal){
            if(candidateGroup===partnerGroup){if(candidateGroup==="flower"&&!canFlowerHarmonyAlign(type,partner.piece.type,index,partner.index))return false;if(candidateGroup==="tool")return false}
            else if(!mixedHarmonyCanAlign(flowerType,candidateGroup==="flower"?index:partner.index,candidateGroup==="flower"?partner.index:index))return false;
          }else if(!isAligned(index,partner.index))return false;
          const flowerRay=candidateGroup==="flower"||partnerGroup==="flower";
          return lineClear(index,partner.index,[],diagonal)&&(!flowerRay||!rockBlocksFlowerLine(index,partner.index,diagonal));
        }
        if(!canCloseTo(first)||!canCloseTo(last)||placementSightConflict(type,index)||!trialCenterRingPlacementWins(owner,type,index))return;
        const key=type+"|"+index;if(seen.has(key))return;seen.add(key);
        found.push({kind:"place",type:type,index:index,hint:1000000,tacticalWin:true});
      });
    }
  });
  return found;
}
function flowerLinkKeySet(status){
  if(!(status._botFlowerLinkKeys instanceof Set))status._botFlowerLinkKeys=new Set(status.flowerLinks.map(function(l){return [l.a,l.b].sort().join("|")}));
  return status._botFlowerLinkKeys;
}
function centerRingCornerBonus(type,index,owner,status,candidateRectangles){
  if(DEFS[type].group!=="flower")return 0;
  const linkKeys=flowerLinkKeySet(status),rectangles=candidateRectangles||centerRingRectangles().byCorner[index];
  let best=0;
  for(let r=0;r<rectangles.length;r++){
    const rectangle=rectangles[r],x1=rectangle.x1,x2=rectangle.x2,y1=rectangle.y1,y2=rectangle.y2,cells=rectangle.cells;
    const slot=cells.indexOf(index);if(slot<0)continue;
    let occupied=0,blocked=false,activeEdges=0,possible=true;
    const corners=cells.map(function(i){return i===index?{id:"@candidate",type:type,owner:owner}:state.board[i]});
    for(let c=0;c<4;c++){
      if(c===slot)continue;
      const p=corners[c];
      if(!p)continue;
      if(!isFlower(p)||p.owner!==owner){blocked=true;break}
      occupied++;
    }
    if(blocked)continue;
    [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
      const a=corners[pair[0]],b=corners[pair[1]];
      if(!a||!b)return;
      if(pair.indexOf(slot)>=0){
        const ai=cells[pair[0]],bi=cells[pair[1]],diagonal=isDiagonal(ai,bi);
        if(pieceRelation(a,b,"flower")!=="H"||!canFlowerHarmonyAlign(a.type,b.type,ai,bi)||rockBlocksFlowerLine(ai,bi,diagonal)||!lineClear(ai,bi,[],diagonal))possible=false;
      }else{
        if(!linkKeys.has([a.id,b.id].sort().join("|")))possible=false;
        else activeEdges++;
      }
    });
    if(!possible)continue;
    let bonus=occupied>=2?29+activeEdges*3:occupied===1?10+activeEdges*2.5:8.5;
    if(occupied===2){
      const compact=(x2-x1-2)+(y2-y1-2);
      bonus-=Math.max(0,compact)*.5;
    }
    best=Math.max(best,bonus);
  }
  return best;
}
function prepareCenterRingBonusCandidates(owner){
  const map=Array.from({length:SIZE*SIZE},function(){return []}),rectangles=centerRingRectangles().all;
  for(let r=0;r<rectangles.length;r++){
    const rectangle=rectangles[r],corners=rectangle.cells.map(function(index){return state.board[index]});
    if(!corners.some(function(piece){return piece&&piece.owner===owner&&isFlower(piece)}))continue;
    for(let slot=0;slot<4;slot++){
      const index=rectangle.cells[slot];if(state.board[index])continue;
      let viable=true;
      for(let c=0;c<4;c++)if(c!==slot&&corners[c]&&(!isFlower(corners[c])||corners[c].owner!==owner)){viable=false;break}
      if(viable)map[index].push(rectangle);
    }
  }
  return map;
}
function centerRingPlanScore(owner,status){
  const linkKeys=flowerLinkKeySet(status),ringIndex=centerRingRectangles(),ownedTypeCounts={},candidateRects=new Set();
  getPieces("flower").forEach(function(q){
    if(q.piece.owner!==owner)return;
    ownedTypeCounts[q.piece.type]=(ownedTypeCounts[q.piece.type]||0)+1;
    ringIndex.byCorner[q.index].forEach(function(rectangle){candidateRects.add(rectangle)});
  });
  if(!candidateRects.size)return 0;
  let best=0;
  const rectangles=Array.from(candidateRects);
  for(let r=0;r<rectangles.length;r++){
    const rectangle=rectangles[r],x1=rectangle.x1,x2=rectangle.x2,y1=rectangle.y1,y2=rectangle.y2,cells=rectangle.cells;
    const corners=cells.map(function(i){return state.board[i]});
    if(corners.some(function(p){return p&&(!isFlower(p)||p.owner!==owner)}))continue;
    const filled=corners.filter(Boolean).length;if(filled<1||filled===4)continue;
    const patterns=centerRingPatternsForCorners(corners);
    const activeEdges=new Set(),occupiedByType={};let brokenEdges=0,blockers=0,hardBlocked=0;
    [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
      const a=corners[pair[0]],b=corners[pair[1]],ai=cells[pair[0]],bi=cells[pair[1]],diagonal=isDiagonal(ai,bi);
      if(a&&b){
        const key=[a.id,b.id].sort().join("|");
        if(linkKeys.has(key))activeEdges.add(pair.join("-"));
        else{
          brokenEdges++;
          blockers+=lineIndices(ai,bi,false).reduce(function(total,i){const piece=state.board[i];return total+(piece?(piece.owner===owner?1:3):0)},0);
          if(rockBlocksFlowerLine(ai,bi,diagonal))hardBlocked++;
        }
      }else{
        blockers+=lineIndices(ai,bi,false).reduce(function(total,i){const piece=state.board[i];return total+(piece?(piece.owner===owner?1:3):0)},0);
        if(rockBlocksFlowerLine(ai,bi,diagonal))hardBlocked++;
      }
    });
    if(hardBlocked>=2)continue;
    corners.forEach(function(p){if(p)occupiedByType[p.type]=(occupiedByType[p.type]||0)+1});
    let canFinish=false,reserveReadySlots=0,preferredPattern=0;
    for(let p=0;p<patterns.length;p++){
      const pattern=patterns[p],needed={};let matches=true;
      for(let slot=0;slot<4;slot++){
        if(corners[slot]){if(corners[slot].type!==pattern[slot]){matches=false;break}}
        else needed[pattern[slot]]=(needed[pattern[slot]]||0)+1;
      }
      if(!matches)continue;
      let ready=0;
      for(const type in needed){
        const external=(ownedTypeCounts[type]||0)-(occupiedByType[type]||0),reserve=state.reserves[owner][type]||0;
        if(reserve+external<needed[type]){matches=false;break}
        ready+=Math.min(needed[type],reserve);
      }
      if(matches){canFinish=true;reserveReadySlots=Math.max(reserveReadySlots,ready);preferredPattern=Math.max(preferredPattern,openingPatternBonus(owner,pattern))}
    }
    if(!canFinish)continue;
    const nLinks=activeEdges.size,compact=(x2-x1-2)+(y2-y1-2);
    let value=filled===3?38+nLinks*7.5:filled===2?14+nLinks*5.5:5.8;
    value-=brokenEdges*5.5+blockers*1.8+hardBlocked*12;
    value+=reserveReadySlots*2.8-(4-filled-reserveReadySlots)*.6;
    value-=Math.max(0,compact)*.9;
    value+=openingPlanShapeScore(owner,rectangle)*.72+preferredPattern*.55;
    best=Math.max(best,value);
  }
  return best;
}
// Probe a proposed closing flower so dissonance and special rays are reflected in bot plans.
function botLoopPlacementCompletesPath(owner,type,index,left,middle,right){
  const oldPiece=state.board[index],oldStatus=state.lastStatus,oldCurrent=state.current,id="bot-probe-"+state.nextId+"-"+index;
  try{
    state.current=owner;
    state.board[index]={id:id,type:type,owner:owner,used:false,bridgePair:null,mirrorActive:false,shieldTarget:null};
    const probed=boardStatus(),keys=flowerLinkKeySet(probed);
    return [[left.piece,middle.piece],[middle.piece,right.piece],[right.piece,{id:id}],[{id:id},left.piece]].every(function(pair){
      return keys.has([pair[0].id,pair[1].id].sort().join("|"));
    });
  }catch(error){return false}
  finally{state.board[index]=oldPiece;state.lastStatus=oldStatus;state.current=oldCurrent}
}
function centerHarmonyLoopPotential(owner,status){
  status=status||state.lastStatus||boardStatus();
  const flowers=getPieces("flower").filter(function(q){return q.piece.owner===owner});
  if(flowers.length<3)return 0;
  const byId=Object.create(null),neighbors=Object.create(null);
  flowers.forEach(function(q){byId[q.piece.id]=q;neighbors[q.piece.id]=[]});
  status.flowerLinks.forEach(function(link){
    const a=byId[link.a],b=byId[link.b];
    if(!a||!b)return;
    neighbors[link.a].push(b);neighbors[link.b].push(a);
  });
  const types=Object.keys(DEFS).filter(function(type){return DEFS[type].group==="flower"&&DEFS[type].count>0});
  if(!types.length)return 0;
  const openCells=[];
  for(let i=0;i<state.board.length;i++){
    const p=xy(i);
    if(!state.board[i]&&playableAt(p.x,p.y))openCells.push(i);
  }
  // Score any two-link, three-flower path that can close around the center, including slanted loops.
  const closureCells=new Set(),readyClosureCells=new Set(),multipleWays=new Set(),sightCache=Object.create(null),closureCache=Object.create(null);
  for(let m=0;m<flowers.length;m++){
    const middle=flowers[m],linked=neighbors[middle.piece.id];
    for(let a=0;a<linked.length;a++)for(let c=a+1;c<linked.length;c++){
      const left=linked[a],right=linked[c];
      if(left.index>=right.index)continue;
      const pathIds=new Set([left.piece.id,middle.piece.id,right.piece.id]);
      for(let n=0;n<openCells.length;n++){
        const index=openCells[n],pos=xy(index),points=[left.pos,middle.pos,right.pos,pos];
        if(!simpleFourFlowerLoop(points)||!pointInsidePolygon({x:CENTER,y:CENTER},points))continue;
        let fittingTypes=0,readyTypes=0;
        for(let t=0;t<types.length;t++){
          const type=types[t];
          const ready=(state.reserves[owner][type]||0)>0;
          if(!ready&&!flowers.some(function(q){return q.piece.type===type&&!pathIds.has(q.piece.id)}))continue;
          if(pieceRelation({type:type},left.piece,"flower")!=="H"||pieceRelation({type:type},right.piece,"flower")!=="H")continue;
          if(!canFlowerHarmonyAlign(type,left.piece.type,index,left.index)||!canFlowerHarmonyAlign(type,right.piece.type,index,right.index))continue;
          const leftDiagonal=isDiagonal(index,left.index),rightDiagonal=isDiagonal(index,right.index);
          if(rockBlocksFlowerLine(index,left.index,leftDiagonal)||rockBlocksFlowerLine(index,right.index,rightDiagonal))continue;
          if(!lineClear(index,left.index,[],leftDiagonal)||!lineClear(index,right.index,[],rightDiagonal))continue;
          const sightKey=type+"|"+index;
          if(sightCache[sightKey]===undefined)sightCache[sightKey]=!placementSightConflict(type,index);
          if(!sightCache[sightKey])continue;
          const closureKey=type+"|"+index+"|"+left.piece.id+"|"+middle.piece.id+"|"+right.piece.id;
          if(closureCache[closureKey]===undefined)closureCache[closureKey]=botLoopPlacementCompletesPath(owner,type,index,left,middle,right);
          if(!closureCache[closureKey])continue;
          fittingTypes++;
          if(ready)readyTypes++;
          if(fittingTypes>=2&&readyTypes)break;
        }
        if(!fittingTypes)continue;
        const key=String(index);
        closureCells.add(key);
        if(readyTypes)readyClosureCells.add(key);
        if(fittingTypes>1)multipleWays.add(key);
      }
    }
  }
  if(!closureCells.size)return 0;
  const base=readyClosureCells.size?32:18;
  return base+Math.min(4,closureCells.size-1)*6+Math.min(3,multipleWays.size)*3;
}
let centerRingPatternCache=null;
let centerRingPatternIndexCache=null;
function ringPatternSightLegal(types){
  for(let i=0;i<SIGHT_EXCLUSIONS.length;i++){
    const rule=SIGHT_EXCLUSIONS[i],a=types.indexOf(rule.a),b=types.indexOf(rule.b);
    if(a<0||b<0)continue;
    const opposite=Math.abs(a-b)===2,adjacent=Math.abs(a-b)===1||Math.abs(a-b)===3;
    if((rule.axis==="orthogonal"&&adjacent)||(rule.axis==="diagonal"&&opposite))return false;
  }
  return true;
}
function centerRingPatterns(){
  if(centerRingPatternCache)return centerRingPatternCache;
  const types=Object.keys(DEFS).filter(function(t){return DEFS[t].group==="flower"&&DEFS[t].count>0}),patterns=[],seen=new Set();
  function visit(prefix,remaining){
    if(prefix.length===4){
      if(prefix.some(function(type,i){return relation(type,prefix[(i+1)%4],"flower")!=="H"}))return;
      if(!ringPatternSightLegal(prefix))return;
      const rotations=[];
      for(let start=0;start<4;start++){
        const forward=[],reverse=[];
        for(let k=0;k<4;k++){forward.push(prefix[(start+k)%4]);reverse.push(prefix[(start-k+4)%4])}
        rotations.push(forward,reverse);
      }
      rotations.forEach(function(pattern){const key=pattern.join("|");if(!seen.has(key)){seen.add(key);patterns.push(pattern)}});
      return;
    }
    remaining.forEach(function(type){visit(prefix.concat(type),remaining.filter(function(other){return other!==type}))});
  }
  visit([],types);centerRingPatternCache=patterns;return patterns;
}
function centerRingPatternsForCorner(slot,type){
  if(!centerRingPatternIndexCache){
    centerRingPatternIndexCache=Object.create(null);
    const patterns=centerRingPatterns();
    for(let i=0;i<4;i++)for(let p=0;p<patterns.length;p++){
      const key=i+"|"+patterns[p][i];
      if(!centerRingPatternIndexCache[key])centerRingPatternIndexCache[key]=[];
      centerRingPatternIndexCache[key].push(patterns[p]);
    }
  }
  return centerRingPatternIndexCache[slot+"|"+type]||[];
}
let centerRingCompatiblePatternCache=Object.create(null);
function centerRingPatternsForCorners(corners){
  let seedSlot=-1;
  const signature=corners.map(function(piece,slot){if(piece&&seedSlot<0)seedSlot=slot;return piece?slot+":"+piece.type:"-"}).join("|");
  if(centerRingCompatiblePatternCache[signature])return centerRingCompatiblePatternCache[signature];
  if(seedSlot<0)return centerRingPatterns();
  const type=corners[seedSlot].type,compatible=centerRingPatternsForCorner(seedSlot,type).filter(function(pattern){
    for(let slot=0;slot<4;slot++)if(corners[slot]&&corners[slot].type!==pattern[slot])return false;
    return true;
  });
  centerRingCompatiblePatternCache[signature]=compatible;
  return compatible;
}
function chooseEmptyCenterRingPlan(owner,patterns,rectangles,ownedTypeCounts){
  const patternOffset=(state.botOpeningSeeds&&state.botOpeningSeeds[owner]||0)%Math.max(1,patterns.length);
  let bestTypes=null,bestPatternScore=-Infinity;
  for(let step=0;step<patterns.length;step++){
    const types=patterns[(step+patternOffset)%patterns.length],needed={};
    types.forEach(function(type){needed[type]=(needed[type]||0)+1});
    let reserveReady=0,delayed=0,available=true;
    for(const type in needed){
      const reserve=state.reserves[owner][type]||0,external=ownedTypeCounts[type]||0;
      if(reserve+external<needed[type]){available=false;break}
      const ready=Math.min(needed[type],reserve);reserveReady+=ready;delayed+=needed[type]-ready;
    }
    if(!available)continue;
    const score=reserveReady*14-delayed*8+openingPatternBonus(owner,types)+(openingIsActive(owner)?openingTieBreak(owner,types.join("|"))*.18:0);
    if(score>bestPatternScore){bestPatternScore=score;bestTypes=types}
  }
  if(!bestTypes)return null;
  let best=null,bestScore=-Infinity;
  for(let r=0;r<rectangles.length;r++){
    const rectangle=rectangles[r];
    if(rectangle.cells.some(function(index){return !!state.board[index]}))continue;
    const compact=(rectangle.x2-rectangle.x1-2)+(rectangle.y2-rectangle.y1-2);
    const tie=openingIsActive(owner)?openingTieBreak(owner,rectangle.cells[0]+"|"+bestTypes.join("|"))*.18:0;
    const compactCost=openingIsActive(owner)?.5:4;
    const score=bestPatternScore-Math.max(0,compact)*compactCost+openingPlanShapeScore(owner,rectangle)+tie;
    if(score>bestScore){bestScore=score;best={cells:rectangle.cells.slice(),types:bestTypes.slice(),score:score}}
  }
  return best;
}
function planStillUsable(owner,plan,status){
  if(!plan||!plan.cells||!plan.types)return false;
  for(let i=0;i<4;i++){
    const p=state.board[plan.cells[i]];
    if(p&&p.owner!==owner)return false;
    if(p&&p.owner===owner&&(!isFlower(p)||p.type!==plan.types[i]))return false;
  }
  let blockedEdges=0,brokenEdges=0,blockerCount=0,enemyBlockers=0,rockEdges=0;
  const linkKeys=flowerLinkKeySet(status||state.lastStatus||boardStatus());
  [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
    const a=state.board[plan.cells[pair[0]]],b=state.board[plan.cells[pair[1]]];
    const linked=a&&b&&linkKeys.has([a.id,b.id].sort().join("|"));
    const emptySlot=!a?pair[0]:!b?pair[1]:-1,neededType=emptySlot>=0?plan.types[emptySlot]:null;
    const blockerPieces=lineIndices(plan.cells[pair[0]],plan.cells[pair[1]],false).map(function(i){return state.board[i]}).filter(Boolean);
    const actionable=blockerPieces.filter(function(piece){return !(emptySlot>=0&&piece.owner===owner&&isFlower(piece)&&piece.type===neededType)});
    const blocked=actionable.length>0;
    if(blocked&&!linked){blockedEdges++;blockerCount+=actionable.length;enemyBlockers+=actionable.filter(function(piece){return piece.owner!==owner}).length;if(rockBlocksFlowerLine(plan.cells[pair[0]],plan.cells[pair[1]],false))rockEdges++}
    if(a&&b&&!linked)brokenEdges++;
  });
  if(blockedEdges>=2||(blockedEdges>=1&&brokenEdges>=1)||blockerCount>=2||enemyBlockers>0||rockEdges>0)return false;
  return true;
}
function chooseCenterRingPlan(owner,status){
  const ringIndex=centerRingRectangles(),rectangles=ringIndex.all,patterns=centerRingPatterns(),linkKeys=flowerLinkKeySet(status);
  const ownedTypeCounts={},ownFlowers=[];getPieces("flower").forEach(function(q){if(q.piece.owner===owner){ownedTypeCounts[q.piece.type]=(ownedTypeCounts[q.piece.type]||0)+1;ownFlowers.push(q)}});
  if(!Object.keys(ownedTypeCounts).length){
    return chooseEmptyCenterRingPlan(owner,patterns,rectangles,ownedTypeCounts);
  }
  const candidateRects=new Set();ownFlowers.forEach(function(q){ringIndex.byCorner[q.index].forEach(function(rectangle){candidateRects.add(rectangle)})});
  const emptyPlan=chooseEmptyCenterRingPlan(owner,patterns,rectangles,ownedTypeCounts);
  let best=emptyPlan,bestScore=emptyPlan?emptyPlan.score:-Infinity;
  const relevantRectangles=Array.from(candidateRects);
  for(let r=0;r<relevantRectangles.length;r++){
    const rectangle=relevantRectangles[r],cells=rectangle.cells,pieces=cells.map(function(i){return state.board[i]});
    if(pieces.some(function(p){return p&&(p.owner!==owner||!isFlower(p))}))continue;
    const ownCorners=pieces.map(function(p){return p&&p.owner===owner?p:null});
    let occupied=0,enemyCorners=0,blockers=0,liveEdges=0,brokenEdges=0,blockedEdges=0;
    ownCorners.forEach(function(p){if(p)occupied++});
    const compact=(rectangle.x2-rectangle.x1-2)+(rectangle.y2-rectangle.y1-2);
    pieces.forEach(function(p){if(p&&p.owner!==owner)enemyCorners++});
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
      const a=ownCorners[pair[0]],b=ownCorners[pair[1]],ia=cells[pair[0]],ib=cells[pair[1]];
      const linked=a&&b&&linkKeys.has([a.id,b.id].sort().join("|"));
      if(linked)liveEdges++;else if(a&&b)brokenEdges++;
      const path=lineIndices(ia,ib,false);
      const blockerPieces=path.map(function(i){return state.board[i]}).filter(Boolean),edgeBlocked=blockerPieces.length>0;
      if(edgeBlocked&&!linked){blockers+=blockerPieces.reduce(function(total,piece){return total+(piece.owner===owner?1:4)+(piece.type==="rock"?6:0)},0);blockedEdges++}
    });
    if(blockedEdges>=2||(blockedEdges>=1&&brokenEdges>=1)||blockers>=5)continue;
    const patternOffset=(state.botOpeningSeeds&&state.botOpeningSeeds[owner]||0)%Math.max(1,patterns.length);
    for(let pStep=0;pStep<patterns.length;pStep++){
      const p=(pStep+patternOffset)%patterns.length;
      const types=patterns[p];
      let matches=true;
      for(let i=0;i<4;i++)if(ownCorners[i]&&ownCorners[i].type!==types[i]){matches=false;break}
      if(!matches)continue;
      const occupiedByType={};ownCorners.forEach(function(piece){if(piece)occupiedByType[piece.type]=(occupiedByType[piece.type]||0)+1});
      const needed={};for(let i=0;i<4;i++)if(!ownCorners[i])needed[types[i]]=(needed[types[i]]||0)+1;
      let reserveReady=0,delayed=0;
      for(const type in needed){
        const reserve=state.reserves[owner][type]||0,external=(ownedTypeCounts[type]||0)-(occupiedByType[type]||0);
        if(reserve+external<needed[type]){matches=false;break}
        const ready=Math.min(needed[type],reserve);reserveReady+=ready;delayed+=needed[type]-ready;
      }
      if(!matches)continue;
      const styleScore=openingPlanShapeScore(owner,rectangle)+openingPatternBonus(owner,types);
      const tie=openingIsActive(owner)?openingTieBreak(owner,rectangle.cells[0]+"|"+types.join("|"))*.18:0;
      const compactCost=openingIsActive(owner)?.5:4;
      let effectiveBlockers=blockers;
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
        const emptySlot=!ownCorners[pair[0]]?pair[0]:!ownCorners[pair[1]]?pair[1]:-1;
        if(emptySlot<0)return;
        const needType=types[emptySlot];
        lineIndices(cells[pair[0]],cells[pair[1]],false).forEach(function(i){const piece=state.board[i];if(piece&&piece.owner===owner&&isFlower(piece)&&piece.type===needType)effectiveBlockers=Math.max(0,effectiveBlockers-1)});
      });
      const score=occupied*50+liveEdges*8-enemyCorners*24-brokenEdges*35-effectiveBlockers*25+reserveReady*14-delayed*8-Math.max(0,compact)*compactCost+styleScore+tie;
      if(score>bestScore){bestScore=score;best={cells:cells.slice(),types:types.slice(),score:score}}
    }
  }
  return best;
}
function ensureCenterRingPlan(owner,status){
  if(!state.botCenterPlans)state.botCenterPlans=[null,null];
  let plan=state.botCenterPlans[owner];
  if(!planStillUsable(owner,plan,status))plan=chooseCenterRingPlan(owner,status||state.lastStatus||boardStatus());
  state.botCenterPlans[owner]=plan;
  return plan;
}
function ensureBotCenterPlans(status){
  status=status||state.lastStatus||boardStatus();
  ensureCenterRingPlan(0,status);
  ensureCenterRingPlan(1,status);
}
function centerTargetProgressScore(owner,status,rootOwner){
  const plan=ensureCenterRingPlan(owner,status);if(!plan)return 0;
  let score=0,filled=0;const matching=[],ownedTypeCounts={};status=status||state.lastStatus||boardStatus();
  getPieces("flower").forEach(function(q){if(q.piece.owner===owner)ownedTypeCounts[q.piece.type]=(ownedTypeCounts[q.piece.type]||0)+1});
  for(let i=0;i<4;i++){
    const p=state.board[plan.cells[i]],type=plan.types[i];matching[i]=p&&p.owner===owner&&isFlower(p)&&p.type===type;
    if(matching[i]){score+=5;filled++}
    else if(p&&p.owner!==owner)score-=8;
    else if(p)score-=3;
    else if(!p){
      const reserve=state.reserves[owner][type]||0;
      const ownCopies=ownedTypeCounts[type]||0;
      score+=reserve?1.1:ownCopies?0.15:0;
    }
  }
  [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
    const ai=plan.cells[pair[0]],bi=plan.cells[pair[1]],a=state.board[ai],b=state.board[bi];
    const blockers=lineIndices(ai,bi,false).map(function(i){return state.board[i]}).filter(Boolean);
    const blockWeight=owner===rootOwner?4:filled>=3?6:0;
    const linked=matching[pair[0]]&&matching[pair[1]]&&getLink(status,a,b,"flower");
    if(!linked)blockers.forEach(function(p){score-=p.owner===owner?blockWeight:blockWeight*.5});
    if(matching[pair[0]]&&matching[pair[1]]){
      if(linked)score+=2.2;
      else if(!blockers.length)score-=1.5;
    }
  });
  return score+filled*.4;
}
function centerTargetPathPenalty(index,plan){
  if(!plan)return 0;
  let penalty=0;
  [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){if(lineIndices(plan.cells[pair[0]],plan.cells[pair[1]],false).indexOf(index)>=0)penalty=38});
  return -penalty;
}
function centerTargetMoveBonus(type,index,plan){
  if(!plan)return 0;
  const slot=plan.cells.indexOf(index);if(slot<0)return 0;
  return type===plan.types[slot]?48:-18;
}
function quickPlacementScore(type,index,owner,status,plan,ringBonusCandidates){
  const group=DEFS[type].group,pos=xy(index);
  let score=botPositionValue(index,group)+(group==="flower"?1.2:.15);
  if(DEFS[type].ability)score+=.25;
  if(type==="whiteLotus")score+=.55;
  if(type==="vine"||type==="bamboo")score+=.35;
  const pieces=getPieces();
  for(let i=0;i<pieces.length;i++){
    const q=pieces[i],otherGroup=DEFS[q.piece.type].group;
    if(otherGroup!==group){
      const flowerType=group==="flower"?type:q.piece.type,toolType=group==="tool"?type:q.piece.type;
      const rel=mixedRelation(flowerType,toolType),flowerIndex=group==="flower"?index:q.index,toolIndex=group==="tool"?index:q.index;
      const diagonal=isDiagonal(index,q.index);
      if(diagonal){if(rel!=="H"||!mixedHarmonyCanAlign(flowerType,flowerIndex,toolIndex))continue}
      else if(!isAligned(index,q.index))continue;
      if(!lineClear(index,q.index,[],diagonal)||rockBlocksFlowerLine(index,q.index,diagonal))continue;
      if(rel==="H"&&q.piece.owner===owner)score+=3.1;
      else if(rel==="D")score+=q.piece.owner===owner?-2.5:1.8;
      continue;
    }
    const rel=relation(type,q.piece.type,group);
    const diagonal=isDiagonal(index,q.index);
    if(diagonal){if(group!=="flower"||rel!=="H"||!canFlowerHarmonyAlign(type,q.piece.type,index,q.index))continue}
    else if(!isAligned(index,q.index))continue;
    if(!lineClear(index,q.index,[],diagonal&&group==="flower"))continue;
    if(group==="flower"&&rockBlocksFlowerLine(index,q.index,diagonal))continue;
    if(rel==="H"){
      if(q.piece.owner===owner)score+=group==="flower"?5.2:1.35;
    }else if(rel==="D"){
      if(q.piece.owner===owner)score-=group==="flower"?4.4:.85;
      else score+=group==="flower"?2.5:.6;
    }
  }
  const history=state.botPlacementHistory&&state.botPlacementHistory[owner]||[],lateFactor=botEndgameFactor();
  for(let i=history.length-1,seen=0;i>=0&&seen<8;i--,seen++){
    const move=history[i];
    if(move.index===index){
      const recent=seen<3?1.35:1;
      score-=(move.type===type?6.5+lateFactor*11:1.8+lateFactor*4)*recent;
    }
  }
  const openingVariation=openingIsActive(owner)?openingTieBreak(owner,type+"|"+index)*.42:0;
  return score+counterpointPlacementBonus(type,index,owner)+(status?centerRingCornerBonus(type,index,owner,status,ringBonusCandidates&&ringBonusCandidates[index]):0)+centerTargetPathPenalty(index,plan)+centerTargetMoveBonus(type,index,plan)+openingVariation;
}
function botLinkCount(piece,status){
  const links=(DEFS[piece.type].group==="flower"?status.flowerLinks:status.toolLinks).concat(status.mixedLinks);
  return links.reduce(function(n,l){return n+(l.a===piece.id||l.b===piece.id?1:0)},0);
}
function centerPlanPositionHint(type,index,owner,pieceOwner){
  const plan=state.botCenterPlans&&state.botCenterPlans[owner];if(!plan)return 0;
  const slot=plan.cells.indexOf(index);
  if(slot>=0){
    if(pieceOwner!==owner)return -22;
    return type===plan.types[slot]?26:-14;
  }
  let onPath=false;
  [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){if(lineIndices(plan.cells[pair[0]],plan.cells[pair[1]],false).indexOf(index)>=0)onPath=true});
  return onPath?-4:0;
}
function centerPlanShiftHint(type,from,to,owner,pieceOwner){
  return centerPlanPositionHint(type,to,owner,pieceOwner)-centerPlanPositionHint(type,from,owner,pieceOwner);
}
function botAbilityActions(owner,status){
  const groups={},clearanceMap=centerRingClearanceMap(owner,status);
  function add(kind,action,hint){if(!groups[kind])groups[kind]=[];action.kind=kind;action.hint=hint;groups[kind].push(action)}
  const own=getPieces().filter(function(q){return q.piece.owner===owner});
  const flowers=own.filter(function(q){return isFlower(q.piece)});
  const enemies=getPieces().filter(function(q){return q.piece.owner!==owner});
  own.forEach(function(q){
    const source=q.piece,type=source.type,sourceIndex=q.index,d=DEFS[type],p=q.pos;
    const disabled=isFlower(source)?status.fDisabled[source.id]:status.tDisabled[source.id];
    if(!d.ability||source.used||(disabled&&type!=="bell"))return;
    if(type==="wheel")add(type,{source:sourceIndex},1);
    if(type==="mirror")add(type,{source:sourceIndex},1.2);
    if(type==="bridge"){
      for(let a=0;a<flowers.length;a++)for(let b=a+1;b<flowers.length;b++){
        const A=flowers[a],B=flowers[b];
        if(pieceRelation(A.piece,B.piece,"flower")!=="H"||!isAligned(A.index,B.index)||!pointBetween(sourceIndex,A.index,B.index))continue;
        let hint=getLink(status,A.piece,B.piece,"flower")?-.2:3.2;
        hint+=centerRingBridgeHint(A,B,owner,status);
        const plan=state.botCenterPlans&&state.botCenterPlans[owner];
        if(plan)for(let e=0;e<4;e++){
          const ni=(e+1)%4,aId=indexOfId(A.piece.id),bId=indexOfId(B.piece.id);
          if((plan.cells[e]===aId&&plan.cells[ni]===bId)||(plan.cells[e]===bId&&plan.cells[ni]===aId))hint+=26;
        }
        add(type,{source:sourceIndex,aId:A.piece.id,bId:B.piece.id},hint);
      }
    }
    if(type==="boat"){
      const range=1+(regionAt(p.x,p.y)==="neutral"?1:0);
      flowers.forEach(function(target){
        if(chebyshev(sourceIndex,target.index)>range)return;
        for(let to=0;to<state.board.length;to++){
          const dest=xy(to);
          if(!playableAt(dest.x,dest.y)||state.board[to]||chebyshev(sourceIndex,to)>range)continue;
          const hint=botPositionValue(to,"flower")-botPositionValue(target.index,"flower")+(status.fDisabled[target.piece.id]?2:0)+centerPlanShiftHint(target.piece.type,target.index,to,owner,target.piece.owner)+centerRingClearanceShiftHint(target.index,to,clearanceMap);
          add(type,{source:sourceIndex,target:target.piece.id,to:to},hint);
        }
      });
    }
    if(type==="fan"){
      const limit=3+(regionAt(p.x,p.y)==="neutral"?1:0);
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(dir){
        let x=p.x+dir[0],y=p.y+dir[1],count=0,blocked=false;
        while(inBounds(x,y)&&state.board[idx(x,y)]&&count<limit){if(state.board[idx(x,y)].type==="rock"){blocked=true;break}count++;x+=dir[0];y+=dir[1]}
        if(!blocked&&count&&inBounds(x,y)&&!state.board[idx(x,y)]){
          let clearance=0;for(let step=1;step<=count;step++){const from=idx(p.x+dir[0]*step,p.y+dir[1]*step),to=idx(p.x+dir[0]*(step+1),p.y+dir[1]*(step+1));clearance+=centerRingClearanceShiftHint(from,to,clearanceMap)}
          add(type,{source:sourceIndex,dx:dir[0],dy:dir[1]},count*.7+clearance);
        }
      });
    }
    if(type==="bell"){
      const range=2+(regionAt(p.x,p.y)==="neutral"?1:0);
      enemies.forEach(function(target){
        if(target.piece.type==="rock"||!isAligned(sourceIndex,target.index)||Math.max(Math.abs(target.pos.x-p.x),Math.abs(target.pos.y-p.y))>range||!lineClear(sourceIndex,target.index))return;
        const nx=target.pos.x+Math.sign(p.x-target.pos.x),ny=target.pos.y+Math.sign(p.y-target.pos.y);
        if(!inBounds(nx,ny)||state.board[idx(nx,ny)])return;
        add(type,{source:sourceIndex,target:target.piece.id,to:idx(nx,ny)},2+botLinkCount(target.piece,status)*1.4+(isFlower(target.piece)?1:0)+centerPlanShiftHint(target.piece.type,target.index,idx(nx,ny),owner,target.piece.owner)+centerRingClearanceShiftHint(target.index,idx(nx,ny),clearanceMap));
      });
    }
    if(type==="whiteLotus")flowers.forEach(function(target){
      if(chebyshev(sourceIndex,target.index)>2)return;
      const raw=status.flowerD.filter(function(link){return link.a===target.piece.id||link.b===target.piece.id}).length;
      const p=target.pos,threshold=regionAt(p.x,p.y)==="red"?1:regionAt(p.x,p.y)==="white"?3:2;
      const hint=(status.fDisabled[target.piece.id]?6:raw===threshold-1?4:0)+botLinkCount(target.piece,status)*.6;
      add(type,{source:sourceIndex,target:target.piece.id},hint);
    });
    if(type==="orchid")enemies.forEach(function(target){
      if(!isFlower(target.piece)||chebyshev(sourceIndex,target.index)>1)return;
      const nx=target.pos.x+Math.sign(target.pos.x-p.x),ny=target.pos.y+Math.sign(target.pos.y-p.y);
      if(!inBounds(nx,ny)||state.board[idx(nx,ny)])return;
      add(type,{source:sourceIndex,target:target.piece.id,to:idx(nx,ny)},3+botLinkCount(target.piece,status)*1.2+centerPlanShiftHint(target.piece.type,target.index,idx(nx,ny),owner,target.piece.owner)+centerRingClearanceShiftHint(target.index,idx(nx,ny),clearanceMap));
    });
    if(type==="thorn")enemies.forEach(function(target){
      if(!isFlower(target.piece)||!isAligned(sourceIndex,target.index)||Math.max(Math.abs(target.pos.x-p.x),Math.abs(target.pos.y-p.y))>3||!lineClear(sourceIndex,target.index))return;
      const options=target.pos.y===p.y?[idx(target.pos.x,target.pos.y-1),idx(target.pos.x,target.pos.y+1)]:[idx(target.pos.x-1,target.pos.y),idx(target.pos.x+1,target.pos.y)];
      options.forEach(function(to){const dest=xy(to);if(playableAt(dest.x,dest.y)&&!state.board[to])add(type,{source:sourceIndex,target:target.piece.id,to:to},3.5+botLinkCount(target.piece,status)*1.3+centerPlanShiftHint(target.piece.type,target.index,to,owner,target.piece.owner)+centerRingClearanceShiftHint(target.index,to,clearanceMap))});
    });
  });
  const result=[];
  Object.keys(groups).forEach(function(kind){
    groups[kind].sort(function(a,b){return b.hint-a.hint});
    result.push.apply(result,groups[kind].slice(0,5));
  });
  return result;
}
function centerRingPickupUnlocksWin(owner,type,pieceId,targetIndex){
  const previous=state,previousPoint=lastPoint;let wins=false;
  try{
    state=cloneBotSearchState(previous);
    const from=indexOfId(pieceId),piece=from>=0?state.board[from]:null;
    if(!piece||piece.owner!==owner||piece.type!==type||state.board[targetIndex])return false;
    clearSpecialEffectsOnMove(piece);state.board[from]=null;returnToReserve(piece);
    state.current=owner;state.turnStage="place";state.turnPlacedId=null;state.lastPlacementFinalReserve=false;state.lastStatus=null;
    if(applyBotAction({kind:"place",type:type,index:targetIndex})){
      resolveCapturesAndWin();wins=state.winner===owner;
    }
  }catch(error){wins=false}
  finally{state=previous;lastPoint=previousPoint}
  return wins;
}
function centerRingPickupNeeds(owner,status){
  status=status||state.lastStatus||boardStatus();
  const ringIndex=centerRingRectangles(),linkKeys=flowerLinkKeySet(status),ownedTypeCounts={},candidateRects=new Set(),needs=Object.create(null),optionsByType=Object.create(null),scoresByType=Object.create(null);
  const unlockCache=Object.create(null),late=botEndgameFactor()>=.35;
  getPieces("flower").forEach(function(q){if(q.piece.owner===owner){ownedTypeCounts[q.piece.type]=(ownedTypeCounts[q.piece.type]||0)+1;ringIndex.byCorner[q.index].forEach(function(rectangle){candidateRects.add(rectangle)})}});
  candidateRects.forEach(function(rectangle){
    const cells=rectangle.cells,corners=cells.map(function(i){return state.board[i]});
    if(corners.some(function(piece){return piece&&(!isFlower(piece)||piece.owner!==owner)}))return;
    const filled=corners.filter(Boolean).length;if(filled!==3)return;
    const occupiedTypes={};corners.forEach(function(piece){if(piece)occupiedTypes[piece.type]=(occupiedTypes[piece.type]||0)+1});
    const patterns=centerRingPatternsForCorners(corners);
    let bestByType=Object.create(null);
    for(let p=0;p<patterns.length;p++){
      const pattern=patterns[p],needed={};let fits=true,live=0,broken=0,blocked=0;
      for(let slot=0;slot<4;slot++){
        if(corners[slot]){if(corners[slot].type!==pattern[slot]){fits=false;break}}
        else needed[pattern[slot]]=(needed[pattern[slot]]||0)+1;
      }
      if(!fits)continue;
      for(const type in needed){
        const reserve=state.reserves[owner][type]||0,offRing=Math.max(0,(ownedTypeCounts[type]||0)-(occupiedTypes[type]||0));
        if(reserve+offRing<needed[type]){fits=false;break}
      }
      if(!fits)continue;
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
        const a=corners[pair[0]],b=corners[pair[1]],ai=cells[pair[0]],bi=cells[pair[1]];
        if(a&&b){if(linkKeys.has([a.id,b.id].sort().join("|")))live++;else broken++}
        else{
          const missingSlot=corners.findIndex(function(piece){return !piece}),neededType=pattern[missingSlot];
          lineIndices(ai,bi,false).forEach(function(i){const piece=state.board[i];if(!piece)return;const isRehomeTarget=piece.owner===owner&&isFlower(piece)&&piece.type===neededType;if(!isRehomeTarget)blocked+=piece.type==="rock"?5:piece.owner===owner?.8:2.5});
        }
      });
      const score=(filled===3?105:48)+live*9-broken*8-blocked*3.5;
      for(const type in needed){
        if((state.reserves[owner][type]||0)>0)continue;
        const offRing=Math.max(0,(ownedTypeCounts[type]||0)-(occupiedTypes[type]||0));
        if(offRing>=needed[type]){
          bestByType[type]=Math.max(bestByType[type]||0,score);
          const slot=corners.findIndex(function(piece){return !piece}),target=cells[slot];
          if(!optionsByType[type])optionsByType[type]=new Set();optionsByType[type].add(target);
          scoresByType[type]=Math.max(scoresByType[type]||0,score);
          if(late){
            const source=getPieces("flower").find(function(q){return q.piece.owner===owner&&q.piece.type===type&&!cells.includes(q.index)});
            if(source){
              const key=type+"|"+target+"|"+source.piece.id;
              if(unlockCache[key]===undefined)unlockCache[key]=centerRingPickupUnlocksWin(owner,type,source.piece.id,target);
              if(unlockCache[key])bestByType[type]=Math.max(bestByType[type],1200);
            }
          }
        }
      }
    }
    Object.keys(bestByType).forEach(function(type){needs[type]=Math.max(needs[type]||0,bestByType[type])});
  });
  Object.keys(optionsByType).forEach(function(type){
    const count=optionsByType[type].size;
    needs[type]=Math.max(needs[type]||0,scoresByType[type]+(count>1?75+Math.min(2,count-2)*25:0));
  });
  return needs;
}
function botPickupActionHint(q,owner,status,plan,clearanceMap,ringNeeds){
  const piece=q.piece,index=q.index,hintBase=(clearanceMap[index]||0)*1.15;
  let hint=hintBase+(ringNeeds[piece.type]||0);
  if(plan){
    for(let slot=0;slot<4;slot++){
      if(plan.types[slot]!==piece.type)continue;
      const target=plan.cells[slot],occupant=state.board[target];
      if(!occupant)hint+=52;
      if(target===index&&occupant&&occupant.id===piece.id)hint-=70;
    }
  }
  const disabled=isFlower(piece)?status.fDisabled[piece.id]:status.tDisabled[piece.id];
  if(disabled)hint+=isFlower(piece)?24:10;
  return hint;
}
function botAbilityIsLegal(action,owner){
  const previous=state,previousPoint=lastPoint;
  try{
    state=cloneBotSearchState(previous);state.current=owner;state.turnStage="bonus";
    return applyBotAction(action);
  }catch(error){return false}
  finally{state=previous;lastPoint=previousPoint}
}
function availableAbilityActions(owner,status){
  status=status||state.lastStatus||boardStatus();
  return botAbilityActions(owner,status).filter(function(action){return botAbilityIsLegal(action,owner)}).sort(function(a,b){return (b.hint||0)-(a.hint||0)});
}
function botBonusCandidates(owner,status,limit,searching){
  const abilities=availableAbilityActions(owner,status);
  if(abilities.length)return abilities.slice(0,limit);
  const plan=ensureCenterRingPlan(owner,status),clearanceMap=centerRingClearanceMap(owner,status),ringNeeds=searching?Object.create(null):centerRingPickupNeeds(owner,status);
  const pickups=eligiblePickupPieces(owner,true).map(function(q){return {kind:"pickup",target:q.piece.id,hint:botPickupActionHint(q,owner,status,plan,clearanceMap,ringNeeds)}}).sort(function(a,b){return b.hint-a.hint});
  const late=botEndgameFactor()>=.35,pickupCount=late?5:3;
  return pickups.slice(0,pickupCount).slice(0,limit);
}
function generateBotActions(owner,searching){
  if(state.turnStage==="pickup"||state.turnStage==="pickupRequired"){
    const status=boardStatus();ensureBotCenterPlans(status);const plan=state.botCenterPlans[owner],clearanceMap=centerRingClearanceMap(owner,status),ringNeeds=searching?Object.create(null):centerRingPickupNeeds(owner,status);
    return eligiblePickupPieces(owner,state.turnStage==="pickupRequired").map(function(q){return {kind:"pickup",target:q.piece.id,hint:botPickupActionHint(q,owner,status,plan,clearanceMap,ringNeeds)}}).sort(function(a,b){return b.hint-a.hint});
  }
  if(state.turnStage==="bonus"){
    const status=boardStatus();ensureBotCenterPlans(status);
    return botBonusCandidates(owner,status,32,searching);
  }
  const placements=[],status=boardStatus();
  ensureBotCenterPlans(status);
  const centerPlan=state.botCenterPlans[owner];
  const ringBonusCandidates=prepareCenterRingBonusCandidates(owner);
  for(let i=0;i<state.board.length;i++){
    const p=xy(i);if(!playableAt(p.x,p.y)||state.board[i])continue;
    Object.keys(DEFS).forEach(function(type){
      if((state.reserves[owner][type]||0)>0&&!placementSightConflict(type,i))placements.push({kind:"place",type:type,index:i,hint:quickPlacementScore(type,i,owner,status,centerPlan,ringBonusCandidates)});
    });
  }
  const directWins=centerRingWinningPlacements(owner);
  directWins.forEach(function(win){
    const existing=placements.find(function(action){return action.type===win.type&&action.index===win.index});
    if(existing){existing.tacticalWin=true;existing.hint=win.hint}else placements.push(win);
  });
  const enemyWins=centerRingWinningPlacements(1-owner),threatSlots=Array.from(new Set(enemyWins.map(function(win){return win.index})));
  threatSlots.forEach(function(index){
    const blocker=placements.filter(function(action){return action.index===index}).sort(function(a,b){return b.hint-a.hint})[0];
    if(blocker){blocker.tacticalBlock=true;blocker.hint+=1000}
  });
  const denialWeights=centerRingDenialWeights(owner,status);
  placements.forEach(function(action){
    const weight=denialWeights[action.index]||0;
    if(weight){action.endgameBlock=true;action.hint+=weight}
  });
  placements.sort(function(a,b){return b.hint-a.hint});
  const selected=[],perType={};
  for(let i=0;i<placements.length&&selected.length<26;i++){
    const action=placements[i];if((perType[action.type]||0)>=2)continue;
    selected.push(action);perType[action.type]=(perType[action.type]||0)+1;
  }
  if(centerPlan)for(let slot=0;slot<4;slot++){
    const index=centerPlan.cells[slot],type=centerPlan.types[slot];
    if(state.board[index]||(state.reserves[owner][type]||0)<=0)continue;
    if(selected.some(function(a){return a.kind==="place"&&a.type===type&&a.index===index}))continue;
    const planned=placements.find(function(a){return a.type===type&&a.index===index});
    if(planned)selected.push(planned);
  }
  selected.sort(function(a,b){return b.hint-a.hint});
  return selected;
}
function applyBotAction(action){
  if(action.kind==="place"){
    if(state.turnStage!=="place"||state.board[action.index]||!playableAt(xy(action.index).x,xy(action.index).y)||(state.reserves[state.current][action.type]||0)<=0)return false;
    if(placementSightConflict(action.type,action.index))return false;
    const used=takeFromReserve(state.current,action.type),piece={id:"p"+state.nextId++,type:action.type,owner:state.current,used:used,bridgePair:null,mirrorActive:false,shieldTarget:null};
    state.board[action.index]=piece;state.lastPlacementFinalReserve=!hasReservePieces(state.current);state.turnPlacedId=piece.id;lastPoint=action.index;return true;
  }
  if(action.kind==="pickup"&&(state.turnStage==="bonus"||state.turnStage==="pickup"||state.turnStage==="pickupRequired")){
    if(state.turnStage==="bonus"&&availableAbilityActions(state.current,state.lastStatus||boardStatus()).length)return false;
    const targetIndex=indexOfId(action.target),piece=targetIndex>=0?state.board[targetIndex]:null;
    if(!canPickUpPiece(piece,state.current,true))return false;
    clearSpecialEffectsOnMove(piece);state.board[targetIndex]=null;returnToReserve(piece);state.pickedUp[state.current].push(piece.type);lastPoint=targetIndex;return true;
  }
  if(state.turnStage!=="bonus")return false;
  const source=state.board[action.source];if(!source||source.owner!==state.current||source.used)return false;
  const sourcePos=xy(action.source),sourceNeutral=regionAt(sourcePos.x,sourcePos.y)==="neutral"?1:0;
  const targetIndex=action.target?indexOfId(action.target):-1,target=targetIndex>=0?state.board[targetIndex]:null;
  const status=state.lastStatus||boardStatus(),disabled=DEFS[source.type].group==="flower"?status.fDisabled[source.id]:status.tDisabled[source.id];
  if(disabled&&source.type!=="bell")return false;
  if(action.kind==="wheel"){
    if(!rotateWheel(action.source))return false;source.used=true;lastPoint=action.source;return true;
  }
  if(action.kind==="mirror"){
    source.used=true;source.mirrorActive=true;lastPoint=action.source;return true;
  }
  if(action.kind==="bridge"){
    const a=findById(action.aId),b=findById(action.bId);
    if(!a||!b||a.owner!==state.current||b.owner!==state.current||pieceRelation(a,b,"flower")!=="H"||!isAligned(indexOfId(a.id),indexOfId(b.id))||!pointBetween(action.source,indexOfId(a.id),indexOfId(b.id)))return false;
    source.bridgePair=[a.id,b.id];source.used=true;lastPoint=action.source;return true;
  }
  if(action.kind==="boat"){
    const range=1+sourceNeutral;
    if(!target||!isFlower(target)||state.board[action.to]||chebyshev(action.source,targetIndex)>range||chebyshev(action.source,action.to)>range)return false;
    if(!movementPreservesSight(targetIndex,action.to))return false;
    clearSpecialEffectsOnMove(target);state.board[action.to]=target;state.board[targetIndex]=null;source.used=true;lastPoint=action.to;return true;
  }
  if(action.kind==="fan"){
    if(!fanPush(action.source,action.dx,action.dy,source))return false;source.used=true;lastPoint=action.source;return true;
  }
  if(action.kind==="bell"){
    const range=2+sourceNeutral,tp=target&&xy(targetIndex);
    if(!target||target.owner===state.current||target.type==="rock"||state.board[action.to]||!isAligned(action.source,targetIndex)||Math.max(Math.abs(tp.x-sourcePos.x),Math.abs(tp.y-sourcePos.y))>range||!lineClear(action.source,targetIndex))return false;
    if(!movementPreservesSight(targetIndex,action.to))return false;
    clearSpecialEffectsOnMove(target);state.board[action.to]=target;state.board[targetIndex]=null;source.used=true;lastPoint=action.to;return true;
  }
  if(action.kind==="whiteLotus"){
    if(!target||!isFlower(target)||target.owner!==state.current||chebyshev(action.source,targetIndex)>2)return false;
    source.shieldTarget=target.id;source.used=true;lastPoint=targetIndex;return true;
  }
  if(action.kind==="orchid"){
    if(!target||!isFlower(target)||target.owner===state.current||chebyshev(action.source,targetIndex)>1||state.board[action.to])return false;
    const tp=xy(targetIndex),nx=tp.x+Math.sign(tp.x-sourcePos.x),ny=tp.y+Math.sign(tp.y-sourcePos.y);
    if(!inBounds(nx,ny)||idx(nx,ny)!==action.to)return false;
    if(!movementPreservesSight(targetIndex,action.to))return false;
    clearSpecialEffectsOnMove(target);state.board[action.to]=target;state.board[targetIndex]=null;source.used=true;lastPoint=action.to;return true;
  }
  if(action.kind==="thorn"){
    if(!target||!isFlower(target)||target.owner===state.current||!isAligned(action.source,targetIndex)||Math.max(Math.abs(xy(targetIndex).x-sourcePos.x),Math.abs(xy(targetIndex).y-sourcePos.y))>3||!lineClear(action.source,targetIndex)||state.board[action.to])return false;
    const tp=xy(targetIndex),options=tp.y===sourcePos.y?[idx(tp.x,tp.y-1),idx(tp.x,tp.y+1)]:[idx(tp.x-1,tp.y),idx(tp.x+1,tp.y)],dest=xy(action.to);
    if(options.indexOf(action.to)<0||!playableAt(dest.x,dest.y))return false;
    if(!movementPreservesSight(targetIndex,action.to))return false;
    clearSpecialEffectsOnMove(target);state.board[action.to]=target;state.board[targetIndex]=null;source.used=true;lastPoint=action.to;return true;
  }
  return false;
}
function scoreBotPosition(owner,status){
  if(state.winner!==null)return state.winner===owner?100000:-100000;
  if(state.draw)return 0;
  let score=0;
  const pieces=getPieces();
  pieces.forEach(function(q){
    const p=q.piece,sign=p.owner===owner?1:-1,group=DEFS[p.type].group;
    score+=sign*((group==="flower"?1.4:.35)+botPositionValue(q.index,group));
    if(group==="tool"&&DEFS[p.type].ability&&!p.used)score+=sign*.7;
    const disabled=group==="flower"?status.fDisabled[p.id]:status.tDisabled[p.id];
    if(disabled)score-=sign*(group==="flower"?6.5:2.5);
  });
  status.flowerLinks.forEach(function(link){const p=findById(link.a);if(p)score+=(p.owner===owner?1:-1)*7.2});
  status.toolLinks.forEach(function(link){const p=findById(link.a);if(p)score+=(p.owner===owner?1:-1)*(link.path==="counterpoint"?3.1:1.7)});
  status.mixedLinks.forEach(function(link){const p=findById(link.a);if(p)score+=(p.owner===owner?1:-1)*4.2});
  const flowerKeys=new Set(status.flowerLinks.map(function(l){return [l.a,l.b].sort().join("|")}));
  const ringRectangles=centerRingRectangles().all;
  for(let r=0;r<ringRectangles.length;r++){
    const cells=ringRectangles[r].cells,corners=cells.map(function(i){return state.board[i]});
    [0,1].forEach(function(side){
      let occupied=0,links=0;
      corners.forEach(function(p){if(p&&isFlower(p)&&p.owner===side)occupied++});
      if(occupied<2)return;
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
        const a=corners[pair[0]],b=corners[pair[1]];
        if(a&&b&&isFlower(a)&&isFlower(b)&&a.owner===side&&b.owner===side&&flowerKeys.has([a.id,b.id].sort().join("|")))links++;
      });
      let potential=occupied===4?2+links*2.2:occupied===3?.8+links*1.15:links*.25;
      score+=(side===owner?1:-1)*potential;
    });
  }
  return score;
}
function latentInteractionScore(owner,status){
  const pieces=getPieces(),flowerCounts={},toolCounts={};let score=0;
  status.flowerD.forEach(function(link){flowerCounts[link.a]=(flowerCounts[link.a]||0)+1;flowerCounts[link.b]=(flowerCounts[link.b]||0)+1});
  status.toolD.forEach(function(link){toolCounts[link.a]=(toolCounts[link.a]||0)+1;toolCounts[link.b]=(toolCounts[link.b]||0)+1});
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
    const A=pieces[i],B=pieces[j],a=A.piece,b=B.piece,group=DEFS[a.type].group;
    if(group!==DEFS[b.type].group)continue;
    const rel=pieceRelation(a,b,group);
    if(rel==="H"&&a.owner!==b.owner)continue;
    if(rel!=="H"&&rel!=="D")continue;
    const diagonal=group==="flower"&&rel==="H"&&isDiagonal(A.index,B.index);
    if(rel==="H"&&!canFlowerHarmonyAlign(a.type,b.type,A.index,B.index)&&group==="flower")continue;
    if(rel==="D"&&!isAligned(A.index,B.index))continue;
    if(group==="flower"&&rockBlocksFlowerLine(A.index,B.index,diagonal))continue;
    const blockers=lineIndices(A.index,B.index,diagonal).map(function(k){return state.board[k]}).filter(Boolean);
    if(blockers.length!==1||blockers[0].type==="rock")continue;
    const signA=a.owner===owner?1:-1,signB=b.owner===owner?1:-1;
    if(rel==="H"){
      const nearCenter=Math.min(Math.max(Math.abs(A.pos.x-CENTER),Math.abs(A.pos.y-CENTER)),Math.max(Math.abs(B.pos.x-CENTER),Math.abs(B.pos.y-CENTER)))<=2;
      const value=(group==="flower"?0.9:0.45)+(nearCenter&&group==="flower"?0.45:0);
      score+=signA*value;
    }else{
      const weight=group==="flower"?0.48:0.42;
      score+=signA*weight+signB*weight;
      if(group==="flower"){
        const regionA=regionAt(A.pos.x,A.pos.y),regionB=regionAt(B.pos.x,B.pos.y);
        const thresholdA=regionA==="red"?1:regionA==="white"?3:2;
        const thresholdB=regionB==="red"?1:regionB==="white"?3:2;
        if(!status.fDisabled[a.id]&&(flowerCounts[a.id]||0)+1>=thresholdA)score+=signA*.8;
        if(!status.fDisabled[b.id]&&(flowerCounts[b.id]||0)+1>=thresholdB)score+=signB*.8;
      }
    }
  }
  return Math.max(-8,Math.min(8,score));
}
function botEndgameFactor(){
  const occupied=state.board.reduce(function(total,piece){return total+(piece?1:0)},0);
  const plyPhase=Math.max(0,Math.min(1,((state.ply||0)-14)/26));
  const boardPhase=Math.max(0,Math.min(1,(occupied-8)/10));
  return Math.max(plyPhase,boardPhase);
}
function centerRingRacePotential(owner,status){
  status=status||state.lastStatus||boardStatus();
  const ringIndex=centerRingRectangles(),linkKeys=flowerLinkKeySet(status),ownedTypeCounts={},candidateRects=new Set(),scores=[];
  getPieces("flower").forEach(function(q){if(q.piece.owner===owner){ownedTypeCounts[q.piece.type]=(ownedTypeCounts[q.piece.type]||0)+1;ringIndex.byCorner[q.index].forEach(function(rectangle){candidateRects.add(rectangle)})}});
  if(!candidateRects.size)return 0;
  const rectangles=Array.from(candidateRects),winningSlots=new Set(),futureSlotsByType=Object.create(null);
  for(let r=0;r<rectangles.length;r++){
    const rectangle=rectangles[r],cells=rectangle.cells,corners=cells.map(function(i){return state.board[i]});
    if(corners.some(function(piece){return piece&&(!isFlower(piece)||piece.owner!==owner)}))continue;
    const occupied=corners.filter(Boolean).length;if(occupied<2)continue;
    const occupiedTypes={};corners.forEach(function(piece){if(piece)occupiedTypes[piece.type]=(occupiedTypes[piece.type]||0)+1});
    const patterns=centerRingPatternsForCorners(corners);
    let best=-Infinity;
    for(let p=0;p<patterns.length;p++){
      const pattern=patterns[p],needed={};let fits=true,ready=0,rehome=0;
      for(let slot=0;slot<4;slot++){
        if(corners[slot]){if(corners[slot].type!==pattern[slot]){fits=false;break}}
        else needed[pattern[slot]]=(needed[pattern[slot]]||0)+1;
      }
      if(!fits)continue;
      for(const type in needed){
        const reserve=state.reserves[owner][type]||0,offRing=Math.max(0,(ownedTypeCounts[type]||0)-(occupiedTypes[type]||0));
        if(reserve+offRing<needed[type]){fits=false;break}
        ready+=Math.min(needed[type],reserve);rehome+=Math.max(0,needed[type]-reserve);
      }
      if(!fits)continue;
      let live=0,broken=0,blocked=0;
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
        const a=corners[pair[0]],b=corners[pair[1]],ai=cells[pair[0]],bi=cells[pair[1]];
        const path=lineIndices(ai,bi,false);
        if(a&&b){
          if(linkKeys.has([a.id,b.id].sort().join("|")))live++;
          else{
            broken++;
            path.forEach(function(i){const piece=state.board[i];if(piece)blocked+=piece.type==="rock"?10:piece.owner===owner?.8:7.5});
          }
        }else{
          const missingSlot=!corners[pair[0]]?pair[0]:pair[1],neededType=pattern[missingSlot];
          path.forEach(function(i){const piece=state.board[i];if(!piece)return;const isRehomeTarget=piece.owner===owner&&isFlower(piece)&&piece.type===neededType;if(!isRehomeTarget)blocked+=piece.type==="rock"?10:piece.owner===owner?.6:7.5});
          if(rockBlocksFlowerLine(ai,bi,false))blocked+=2.5;
        }
      });
      const compact=(rectangle.x2-rectangle.x1-2)+(rectangle.y2-rectangle.y1-2);
      const base=occupied===4?105:occupied===3?78:occupied===2?27:8;
      const value=base+live*7.2-broken*7.2-blocked*3.3+ready*2.8-rehome*3.1-Math.max(0,compact)*.9;
      if(value>best)best=value;
      if(occupied===3&&broken===0&&blocked===0){
        for(let slot=0;slot<4;slot++)if(!corners[slot]){
          const type=pattern[slot],index=cells[slot];
          if((state.reserves[owner][type]||0)>0)winningSlots.add(index);
          else if(Math.max(0,(ownedTypeCounts[type]||0)-(occupiedTypes[type]||0))>0){
            if(!futureSlotsByType[type])futureSlotsByType[type]=new Set();
            futureSlotsByType[type].add(index);
          }
        }
      }
    }
    if(best>0)scores.push(best);
  }
  if(!scores.length)return 0;
  scores.sort(function(a,b){return b-a});
  const multiThreatBonus=winningSlots.size?24+Math.min(3,winningSlots.size-1)*50:0;
  let futureThreatBonus=0;
  Object.keys(futureSlotsByType).forEach(function(type){
    const count=futureSlotsByType[type].size;
    futureThreatBonus=Math.max(futureThreatBonus,count>1?70+Math.min(2,count-2)*25:18);
  });
  return scores[0]+(scores[1]||0)*.2+(scores[2]||0)*.08+multiThreatBonus+futureThreatBonus;
}
function centerRingDenialWeights(owner,status){
  const weights=Object.create(null),lateFactor=botEndgameFactor();
  if(lateFactor<.35)return weights;
  const enemy=1-owner,ringIndex=centerRingRectangles(),linkKeys=flowerLinkKeySet(status),enemyTypeCounts={},candidateRects=new Set();
  getPieces("flower").forEach(function(q){if(q.piece.owner===enemy){enemyTypeCounts[q.piece.type]=(enemyTypeCounts[q.piece.type]||0)+1;ringIndex.byCorner[q.index].forEach(function(rectangle){candidateRects.add(rectangle)})}});
  if(!candidateRects.size)return weights;
  const rectangles=Array.from(candidateRects);
  for(let r=0;r<rectangles.length;r++){
    const cells=rectangles[r].cells,corners=cells.map(function(i){return state.board[i]});
    if(corners.some(function(piece){return piece&&(!isFlower(piece)||piece.owner!==enemy)}))continue;
    const filled=corners.filter(Boolean).length;if(filled<2||filled===4)continue;
    const occupiedTypes={};corners.forEach(function(piece){if(piece)occupiedTypes[piece.type]=(occupiedTypes[piece.type]||0)+1});
    const patterns=centerRingPatternsForCorners(corners);
    let threat=-Infinity;
    for(let p=0;p<patterns.length;p++){
      const pattern=patterns[p],needed={};let fits=true;
      for(let slot=0;slot<4;slot++){
        if(corners[slot]){if(corners[slot].type!==pattern[slot]){fits=false;break}}
        else needed[pattern[slot]]=(needed[pattern[slot]]||0)+1;
      }
      if(!fits)continue;
      for(const type in needed){
        const reserve=state.reserves[enemy][type]||0,offRing=Math.max(0,(enemyTypeCounts[type]||0)-(occupiedTypes[type]||0));
        if(reserve+offRing<needed[type]){fits=false;break}
      }
      if(!fits)continue;
      let live=0,broken=0;
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
        const a=corners[pair[0]],b=corners[pair[1]],ai=cells[pair[0]],bi=cells[pair[1]];
        if(a&&b){if(linkKeys.has([a.id,b.id].sort().join("|")))live++;else broken++}
        else if(rockBlocksFlowerLine(ai,bi,false))broken++;
      });
      const risk=(filled===3?1100:470)+live*65-broken*180;
      if(risk>threat)threat=risk;
    }
    if(!Number.isFinite(threat))continue;
    cells.forEach(function(index){if(!state.board[index])weights[index]=Math.max(weights[index]||0,Math.round(threat*lateFactor))});
  }
  return weights;
}
function centerRingClearanceMap(owner,status){
  status=status||state.lastStatus||boardStatus();
  const map=Array(SIZE*SIZE).fill(0),ringIndex=centerRingRectangles();
  getPieces("flower").filter(function(q){return q.piece.owner===owner}).forEach(function(q){
    ringIndex.byCorner[q.index].forEach(function(rectangle){
      const cells=rectangle.cells,corners=cells.map(function(i){return state.board[i]}),ownCount=corners.filter(function(p){return p&&p.owner===owner&&isFlower(p)}).length;
      if(ownCount<2)return;
      const base=ownCount===3?18:10;
      cells.forEach(function(index){const piece=state.board[index];if(piece&&(!isFlower(piece)||piece.owner!==owner))map[index]=Math.max(map[index],base*.75)});
      [[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){
        const a=corners[pair[0]],b=corners[pair[1]],ai=cells[pair[0]],bi=cells[pair[1]];
        if(a&&b&&a.owner===owner&&b.owner===owner&&getLink(status,a,b,"flower"))return;
        const path=lineIndices(ai,bi,false);
        path.forEach(function(index){
          const piece=state.board[index];if(!piece||piece.type==="rock")return;
          const weight=base*(piece.owner===owner?.8:1.1);
          map[index]=Math.min(42,map[index]+weight);
        });
      });
    });
  });
  return map;
}
function centerRingClearanceShiftHint(from,to,map){
  if(!map||from===to)return 0;
  return Math.max(0,(map[from]||0)-(map[to]||0))*1.7;
}
function centerRingBridgeHint(a,b,owner,status){
  const ringIndex=centerRingRectangles(),rectangles=ringIndex.byCorner[a.index]||[];let best=0;
  for(let r=0;r<rectangles.length;r++){
    const cells=rectangles[r].cells,slotA=cells.indexOf(a.index),slotB=cells.indexOf(b.index);
    if(slotA<0||slotB<0||![[0,1],[1,2],[2,3],[3,0]].some(function(pair){return pair.indexOf(slotA)>=0&&pair.indexOf(slotB)>=0}))continue;
    const corners=cells.map(function(i){return state.board[i]}),ownCount=corners.filter(function(p){return p&&p.owner===owner&&isFlower(p)}).length;
    if(ownCount<2||corners.some(function(p){return p&&(!isFlower(p)||p.owner!==owner)}))continue;
    let links=0;[[0,1],[1,2],[2,3],[3,0]].forEach(function(pair){const x=corners[pair[0]],y=corners[pair[1]];if(x&&y&&getLink(status,x,y,"flower"))links++});
    best=Math.max(best,(ownCount===3?34:ownCount===2?20:8)+links*5);
  }
  return best;
}
function scoreBotPositionAdvanced(owner,status){
  ensureBotCenterPlans(status);
  let score=scoreBotPosition(owner,status);
  const central=centralHarmonyScore(status);
  score+=(central[owner]-central[1-owner])*14;
  score+=(centerRingPlanScore(owner,status)-centerRingPlanScore(1-owner,status))*1.35;
  score+=(centerHarmonyLoopPotential(owner,status)-centerHarmonyLoopPotential(1-owner,status))*1.15;
  score+=(centerTargetProgressScore(owner,status,owner)-centerTargetProgressScore(1-owner,status,owner))*1.25;
  const lateFactor=botEndgameFactor();
  if(lateFactor>0)score+=(centerRingRacePotential(owner,status)-centerRingRacePotential(1-owner,status))*lateFactor;
  function valueDissonance(links,weight){
    links.forEach(function(link){
      const a=findById(link.a),b=findById(link.b);
      if(!a||!b)return;
      score+=(a.owner===owner?-1:1)*weight;
      score+=(b.owner===owner?-1:1)*weight;
    });
  }
  valueDissonance(status.flowerD,1.15);
  valueDissonance(status.toolD,1.6);
  valueDissonance(status.mixedD,1.35);
  score+=latentInteractionScore(owner,status);
  getPieces("flower").forEach(function(q){
    const sign=q.piece.owner===owner?1:-1;
    if(status.fDisabled[q.piece.id])score-=sign*7;
  });
  return score;
}
function scoreBotActionUsing(action,owner,evaluator){
  const previous=state,previousPoint=lastPoint;
  state=cloneBotSearchState(previous);state.lastStatus=previous.lastStatus||boardStatus();
  const pickedPiece=action.kind==="pickup"?findById(action.target):null,pickedType=pickedPiece&&pickedPiece.type;
  let score=-Infinity;
  try{
    if(applyBotAction(action)){
      const status=resolveCapturesAndWin();
      score=evaluator(owner,status);
      if(action.kind!=="place")score-=.15;
      if(action.tacticalBlock)score+=250;
      score+=Math.min(.25,(action.hint||0)*.01);
      if(action.kind==="pickup"&&pickedType&&state.winner===null&&!state.draw){
        const plan=state.botCenterPlans&&state.botCenterPlans[owner];let followIndex=-1;
        if(plan)for(let slot=0;slot<4;slot++)if(!state.board[plan.cells[slot]]&&plan.types[slot]===pickedType&&(state.reserves[owner][pickedType]||0)>0){followIndex=plan.cells[slot];break}
        if(followIndex>=0){
          const afterPickup=state,afterPickupPoint=lastPoint;
          state=cloneBotSearchState(afterPickup);state.current=owner;state.turnStage="place";state.turnPlacedId=null;state.lastPlacementFinalReserve=false;
          if(applyBotAction({kind:"place",type:pickedType,index:followIndex})){
            const futureStatus=resolveCapturesAndWin(),futureScore=evaluator(owner,futureStatus);
            score+=Math.min(28,Math.max(0,futureScore-score)*.48);
          }
          state=afterPickup;lastPoint=afterPickupPoint;
        }
      }
    }
  }catch(error){score=-Infinity}
  state=previous;lastPoint=previousPoint;
  return score;
}
function scoreBotActionAdvanced(action,owner){return scoreBotActionUsing(action,owner,scoreBotPositionAdvanced)}
const BOT_THINK_TIME_MS=200;
function botClockNow(){return typeof performance!=="undefined"&&performance.now?performance.now():Date.now()}
function scoreBotContinuationAction(action,actor,rootOwner,required){
  const previous=state,previousPoint=lastPoint;
  try{
    state=cloneBotSearchState(previous);state.current=actor;state.turnStage="bonus";
    if(!applyBotAction(action))return -Infinity;
    let status=resolveCapturesAndWin();
    if(state.winner!==null||state.draw)return scoreBotPositionAdvanced(rootOwner,status);
    if(required&&action.kind!=="pickup"){
      state.lastPlacementFinalReserve=false;
      if(hasOwnedBoardPiece(actor)){
        state.turnStage="pickupRequired";
        const pickups=generateBotActions(actor,true);
        let bestPickup=null,bestPickupScore=-Infinity;
        for(let i=0;i<pickups.length;i++){
          const value=scoreBotActionAdvanced(pickups[i],rootOwner);
          if(value>bestPickupScore){bestPickupScore=value;bestPickup=pickups[i]}
        }
        if(bestPickup&&applyBotAction(bestPickup))status=resolveCapturesAndWin();
      }
    }
    return scoreBotPositionAdvanced(rootOwner,state.lastStatus||status||boardStatus());
  }catch(error){return -Infinity}
  finally{state=previous;lastPoint=previousPoint}
}
function probeBestContinuation(actor,rootOwner,deadline,required){
  const status=boardStatus(),baseline=scoreBotPositionAdvanced(rootOwner,status);
  state.turnStage="bonus";
  let actions=botBonusCandidates(actor,status,14,true);
  let bestAction=null,bestScore=actor===rootOwner?baseline+.05:baseline-.05,complete=true;
  for(let i=0;i<actions.length;i++){
    if(botClockNow()>=deadline-28){complete=false;break}
    const value=scoreBotContinuationAction(actions[i],actor,rootOwner,required);
    const improves=actor===rootOwner?value>bestScore+.05:value<bestScore-.05;
    if((required&&!bestAction)||improves){bestScore=value;bestAction=actions[i]}
  }
  const abilityRequired=actions.some(function(action){return action.kind!=="pickup"});
  if((required||abilityRequired)&&!bestAction&&actions.length)bestAction=actions[0];
  if(bestAction){
    if(!applyBotAction(bestAction))return {complete:false,score:-Infinity};
    let nextStatus=resolveCapturesAndWin();
    if(state.winner!==null||state.draw)return {complete:complete,score:scoreBotPositionAdvanced(rootOwner,nextStatus)};
    if(required&&bestAction.kind!=="pickup"){
      state.lastPlacementFinalReserve=false;
      if(hasOwnedBoardPiece(actor)){
        state.turnStage="pickupRequired";
        const pickups=generateBotActions(actor,true);
        let bestPickup=null,bestPickupScore=-Infinity;
        for(let i=0;i<pickups.length;i++){
          if(botClockNow()>=deadline-28){complete=false;break}
          const value=scoreBotActionAdvanced(pickups[i],rootOwner);
          if(value>bestPickupScore){bestPickupScore=value;bestPickup=pickups[i]}
        }
        if(!bestPickup||!applyBotAction(bestPickup))return {complete:false,score:-Infinity};
        nextStatus=resolveCapturesAndWin();
      }
    }
  }else if(required&&hasOwnedBoardPiece(actor))return {complete:false,score:-Infinity};
  return {complete:complete,score:scoreBotPositionAdvanced(rootOwner,state.lastStatus||boardStatus())};
}
function probeCompleteTurn(action,actor,rootOwner,deadline){
  if(!applyBotAction(action))return {complete:false,score:-Infinity};
  let status=resolveCapturesAndWin();
  if(state.winner!==null||state.draw)return {complete:true,score:scoreBotPositionAdvanced(rootOwner,status)};
  if(action.kind==="place"){
    const required=state.lastPlacementFinalReserve||!hasReservePieces(actor);
    const follow=probeBestContinuation(actor,rootOwner,deadline,required);
    if(!follow.complete)return {complete:false,score:follow.score};
    status=state.lastStatus||status;
    if(state.winner!==null||state.draw)return {complete:true,score:scoreBotPositionAdvanced(rootOwner,status)};
  }
  return {complete:true,score:scoreBotPositionAdvanced(rootOwner,state.lastStatus||status)};
}
function distinctBotReplyCandidates(actions,limit){
  const selected=[],usedSquares=new Set();
  for(let i=0;i<actions.length&&selected.length<limit;i++){
    const action=actions[i];
    if(action.kind!=="place"||(!action.tacticalBlock&&!action.endgameBlock))continue;
    if(usedSquares.has(action.index))continue;
    usedSquares.add(action.index);selected.push(action);
  }
  for(let i=0;i<actions.length&&selected.length<limit;i++){
    const action=actions[i];
    if(action.kind==="place"&&usedSquares.has(action.index))continue;
    if(action.kind==="place")usedSquares.add(action.index);
    selected.push(action);
  }
  return selected;
}
function botReplyProbe(opening,owner,deadline){
  const previous=state,previousPoint=lastPoint;
  let worst=Infinity,complete=false;
  try{
    state=cloneBotSearchState(previous);state.lastStatus=previous.lastStatus||boardStatus();
    if(!applyBotAction(opening))return {worst:-Infinity,complete:false};
    let status=resolveCapturesAndWin();
    if(state.winner!==null||state.draw)return {worst:scoreBotPositionAdvanced(owner,status),complete:true};
    if(opening.kind==="place"){
      const required=state.lastPlacementFinalReserve||!hasReservePieces(owner);
      const follow=probeBestContinuation(owner,owner,deadline,required);
      if(!follow.complete)return {worst:follow.score,complete:false};
      status=state.lastStatus||status;
      if(state.winner!==null||state.draw)return {worst:scoreBotPositionAdvanced(owner,status),complete:true};
    }
    state.current=1-owner;state.turnStage=hasReservePieces(1-owner)?"place":"pickup";state.turnPlacedId=null;state.lastPlacementFinalReserve=false;
    if(botClockNow()>=deadline-90)return {worst:scoreBotPositionAdvanced(owner,state.lastStatus||boardStatus()),complete:false};
    const replies=distinctBotReplyCandidates(generateBotActions(1-owner,true),2);
    if(!replies.length)return {worst:-Infinity,complete:false};
    const responseState=cloneBotSearchState(state);
    complete=true;
    for(let i=0;i<replies.length;i++){
      if(botClockNow()>=deadline-28){complete=false;break}
      state=cloneBotSearchState(responseState);
      const reply=probeCompleteTurn(replies[i],1-owner,owner,deadline);
      if(!reply.complete){complete=false;break}
      let replyScore=reply.score;
      if(replyScore>-99999&&botClockNow()<deadline-24){
        const afterReply=state,afterReplyPoint=lastPoint;
        state=cloneBotSearchState(afterReply);state.current=owner;state.turnStage="place";state.turnPlacedId=null;state.lastPlacementFinalReserve=false;
        const canWinNextTurn=hasReservePieces(owner)&&centerRingWinningPlacements(owner).length>0;
        state=afterReply;lastPoint=afterReplyPoint;
        if(canWinNextTurn)replyScore=100000;
      }
      if(replyScore<worst)worst=replyScore;
    }
  }catch(error){complete=false}
  finally{state=previous;lastPoint=previousPoint}
  return {worst:worst,complete:complete&&Number.isFinite(worst)};
}
function chooseBotAction(){
  const owner=state.current,deadline=botClockNow()+BOT_THINK_TIME_MS;
  const actions=generateBotActions(owner);
  if(!actions.length)return state.turnStage==="bonus"?{kind:"finish"}:null;
  const immediateWin=actions.find(function(action){return action.tacticalWin});
  if(immediateWin)return immediateWin;
  if(botEndgameFactor()>=.35&&(state.turnStage==="bonus"||state.turnStage==="pickup"||state.turnStage==="pickupRequired")){
    const urgentPickup=actions.find(function(action){return action.kind==="pickup"&&(action.hint||0)>=88});
    if(urgentPickup){
      for(let i=0;i<actions.length;i++){
        const action=actions[i];if(action.kind==="pickup"||(action.hint||0)<18)continue;
        if(scoreBotActionAdvanced(action,owner)>50000)return action;
      }
      return urgentPickup;
    }
  }
  if(state.turnStage==="pickup"||state.turnStage==="pickupRequired"){
    let best=actions[0],bestScore=-Infinity;
    for(let i=0;i<actions.length;i++){
      if(botClockNow()>=deadline-28)break;
      const score=scoreBotActionAdvanced(actions[i],owner);
      if(score>bestScore){bestScore=score;best=actions[i]}
    }
    return best;
  }
  if(state.turnStage==="bonus"){
    const baseline=scoreBotPositionAdvanced(owner,boardStatus());
    const candidates=actions.slice(0,12);
    const abilityRequired=candidates.some(function(action){return action.kind!=="pickup"});
    let best=null,bestScore=baseline+.05;
    for(let i=0;i<candidates.length;i++){
      if(botClockNow()>=deadline-28)break;
      const score=scoreBotActionAdvanced(candidates[i],owner);
      if(score>bestScore){bestScore=score;best=candidates[i]}
    }
    return best||(abilityRequired?candidates[0]:{kind:"finish"});
  }
  const candidates=actions.slice(0,3),evaluated=[];
  for(let i=0;i<candidates.length;i++){
    if(botClockNow()>=deadline-75)break;
    evaluated.push({action:candidates[i],base:scoreBotActionAdvanced(candidates[i],owner),score:-Infinity,complete:false});
  }
  if(!evaluated.length)return actions[0];
  evaluated.forEach(function(entry){entry.score=entry.base});
  const ranked=evaluated.slice().sort(function(a,b){return b.base-a.base});
  for(let i=0;i<Math.min(2,ranked.length);i++){
    const entry=ranked[i];
    if(botClockNow()>=deadline-100)break;
    const probe=botReplyProbe(entry.action,owner,deadline);
    if(Number.isFinite(probe.worst)){
      const vulnerability=Math.max(0,entry.base-probe.worst);
      entry.score=entry.base-vulnerability*(probe.complete?0.65:0.35);
      entry.complete=probe.complete;
    }
  }
  evaluated.sort(function(a,b){return b.score-a.score});
  return evaluated[0].action;
}
function botActionMessage(action){
  if(action.kind==="place")return "placed "+DEFS[action.type].short+" at "+(xy(action.index).x+1)+","+(xy(action.index).y+1)+".";
  if(action.kind==="pickup")return (state.turnStage==="pickup"||state.turnStage==="pickupRequired"?"was required to pick up its own ":"picked up its own ")+DEFS[findById(action.target).type].short+" and return it to reserve.";
  if(action.kind==="wheel")return "used Wheel to rotate its surrounding tiles.";
  if(action.kind==="mirror")return "activated Mirror; its right-angle reflection stays active while it remains here.";
  if(action.kind==="bridge")return "used Bridge to connect two compatible flowers.";
  if(action.kind==="boat")return "used Boat to carry "+DEFS[findById(action.target).type].short+".";
  if(action.kind==="fan")return "used Fan to push a line of pieces.";
  if(action.kind==="bell")return "used Bell to pull an enemy tile.";
  if(action.kind==="whiteLotus")return "used White Lotus to shield "+DEFS[findById(action.target).type].short+".";
  if(action.kind==="orchid")return "used Orchid to push an enemy flower away.";
  if(action.kind==="thorn")return "used Thorn to slide an enemy flower sideways.";
  return "used an ability.";
}
function executeBotAction(action){
  if(action.kind==="finish"){finishBonus();return}
  const message=botActionMessage(action);
  snapshot();
  if(!applyBotAction(action)){
    if(state.turnStage==="place")undoState=null;
    if(state.turnStage==="bonus")finishBonus();
    else{setStatus("Bot could not act","The selected move was not legal. Choose New game to restart this test.");render()}
    return;
  }
  if(action.kind==="place")recordBotPlacement(state.current,action.type,action.index);
  else if(action.kind!=="pickup")engineActionIntent={kind:"ability"};
  finishAction(message,"");
}

function resetGame(){
  if(onlineGameId)return;
  cancelScheduledBot();
  state=newState();startRepetitionTracking();undoState=null;selectedType=null;mode="place";pending=null;lastPoint=-1;engineActionIntent=null;
  addLog("New game. "+ownersName(0)+" begins by placing a tile.","");
  render(resolveCapturesAndWin());
}
function engineExport(){
  const out=clone(state);out.player=out.current+1;
  if(out.winner!==null)out.result={winner:out.winner+1,reason:"Center capture"};
  else if(out.draw)out.result={winner:0,reason:"Threefold repetition"};
  else delete out.result;
  return out;
}
function engineLoad(snapshot){
  if(!snapshot||!Array.isArray(snapshot.board)||snapshot.board.length!==SIZE*SIZE||!Array.isArray(snapshot.reserves)||!Number.isInteger(snapshot.current)||snapshot.current<0||snapshot.current>1)throw Error("Invalid Fourfold Garden state");
  state=clone(snapshot);delete state.player;delete state.result;
  pending=null;engineActionIntent=null;selectedType=null;undoState=null;lastPoint=-1;
  mode=state.turnStage==="pickup"||state.turnStage==="pickupRequired"?"pickup":"place";
  state.lastStatus=boardStatus();
}
function engineInitial(){
  state=newState();startRepetitionTracking();state.lastStatus=boardStatus();
  return engineExport();
}
function engineApply(snapshot,action){
  engineLoad(snapshot);
  if(!action||typeof action!=="object")return null;
  const before=JSON.stringify(engineExport());
  if(action.kind==="place"&&Number.isInteger(action.index)&&typeof action.type==="string")placePiece(action.type,action.index);
  else if(action.kind==="pickup"&&Number.isInteger(action.index)){mode="pickup";handlePoint(action.index)}
  else if(action.kind==="finish")finishBonus();
  else if(action.kind==="ability"&&Number.isInteger(action.source)&&Array.isArray(action.targets)&&action.targets.length<=2){
    selectAbilitySource(action.source);
    for(const target of action.targets){if(!Number.isInteger(target))return null;handlePending(target)}
  }else return null;
  if(pending)return null;
  const after=engineExport();
  return JSON.stringify(after)===before?null:after;
}
const FourfoldGardenEngine=Object.freeze({initial:engineInitial,apply:engineApply});
if(typeof window!=="undefined")window.FourfoldGardenEngine=FourfoldGardenEngine;
if(typeof module!=="undefined"&&module.exports){
  engineInitial();
  module.exports=FourfoldGardenEngine;
}else if(typeof document!=="undefined"&&document.getElementById("board")){
  function renderPieceGuide(){
    const host=document.getElementById("pieceGuideGrid");if(!host)return;host.replaceChildren();
    Object.keys(DEFS).filter(type=>DEFS[type].count>0).forEach(type=>{
      const d=DEFS[type],card=document.createElement("article");card.className="piece-guide-card "+d.group;
      const glyph=document.createElement("span");glyph.className="piece-guide-glyph "+d.group;glyph.innerHTML=PIECE_ICONS[type]||d.glyph;glyph.setAttribute("aria-hidden","true");appendHarmonyMarkers(glyph,type);card.title=harmonyMarkerDescription(type);
      const copy=document.createElement("div"),name=document.createElement("h3"),description=document.createElement("p");name.textContent=d.name;description.textContent=d.desc;copy.append(name,description);card.append(glyph,copy);host.append(card);
    });
  }
  function localizeButtonState(){if(onlineGameId){const modeSelect=document.getElementById("opponentMode");if(modeSelect){modeSelect.value="human";modeSelect.disabled=true;}opponentMode="human";}}
  function initOnline(){
    const params=new URLSearchParams(location.search);onlineGameId=params.get("gameId");
    onlineSocket=window.SiteAccounts?.socket?.();
    const status=document.getElementById("onlineStatus");
    if(!onlineSocket){if(status)status.textContent="Online rooms are unavailable. Local play still works.";return}
    const setRoomUrl=id=>{onlineGameId=id;sessionStorage.setItem("hikoro-active-room",id);const url=new URL(location.href);url.searchParams.set("gameId",id);history.replaceState(history.state,"",url.pathname+url.search+url.hash);localizeButtonState();render(state.lastStatus||boardStatus());};
    onlineSocket.on("seatAssigned",data=>{
      if(!data?.gameId)return;
      sessionStorage.setItem("hikoro-seat-"+data.gameId,data.token);
      if(onlineGameId===data.gameId){onlineSeat=Number.isInteger(data.playerIndex)?data.playerIndex:onlineSeat;onlineConnected=true;render();}
    });
    onlineSocket.on("gameCreated",data=>{
      if(data?.gameType!=="fourfold-garden")return;
      setRoomUrl(data.gameId);onlineSeat=0;onlineConnected=true;
      if(status)status.textContent="Table created. Copy the invite link and wait for another player.";
    });
    onlineSocket.on("fourfold-gardenState",data=>{
      if(!data||data.gameId!==onlineGameId||!data.state)return;
      applyingOnlineState=true;state=clone(data.state);onlineSeat=data.playerIndex;onlineConnected=true;onlinePending=false;
      pending=null;engineActionIntent=null;selectedType=null;undoState=null;mode=state.turnStage==="pickup"||state.turnStage==="pickupRequired"?"pickup":"place";lastPoint=-1;
      applyingOnlineState=false;render(state.lastStatus||boardStatus());
    });
    onlineSocket.on("gameStart",game=>{
      if(game?.gameType!=="fourfold-garden"||game.id!==onlineGameId)return;
      onlineConnected=true;
      const token=sessionStorage.getItem("hikoro-seat-"+onlineGameId);
      if(token)onlineSocket.emit("joinFourfoldGardenRoom",{gameId:onlineGameId,token});
    });
    onlineSocket.on("errorMsg",message=>{
      if(!onlineGameId)return;
      onlinePending=false;if(status)status.textContent=String(message||"Online move rejected.");render();
    });
    onlineSocket.on("roomClosed",message=>{if(onlineGameId&&status)status.textContent=String(message||"The online table closed.");});
    onlineSocket.on("connect",()=>{
      onlineConnected=true;
      if(!onlineGameId)return;
      const token=sessionStorage.getItem("hikoro-seat-"+onlineGameId);
      if(token)onlineSocket.emit("joinFourfoldGardenRoom",{gameId:onlineGameId,token});
      else onlineSocket.emit("joinGame",onlineGameId);
      render();
    });
    onlineSocket.on("disconnect",()=>{onlineConnected=false;onlinePending=false;render();});
    document.getElementById("onlineCreateBtn")?.addEventListener("click",()=>{
      if(!onlineSocket.connected){if(status)status.textContent="Connect to the game server before creating a table.";return}
      const playerName=window.SiteAccounts.playerName?.()||document.getElementById("player-name")?.value?.trim()||"Garden player";
      onlineSocket.emit("createGame",{gameType:"fourfold-garden",playerName,timeControl:{main:-1,byoyomiTime:0}});
    });
    document.getElementById("copyInviteBtn")?.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(location.href);if(status)status.textContent="Invite link copied. The other player can join from the collection or open the link."}
      catch{if(status)status.textContent="Copy this address to invite the other player: "+location.href;}
    });
    document.getElementById("resign-button")?.addEventListener("click",()=>{
      if(onlineGameId&&onlineSocket.connected&&confirm("Resign this online match?"))onlineSocket.emit("fourfold-gardenResign",{gameId:onlineGameId});
    });
    if(onlineGameId){localizeButtonState();onlineConnected=onlineSocket.connected;}
  }
  const rulesModal=document.getElementById("rules-modal"),rulesToggle=document.getElementById("rules-toggle"),closeRules=document.getElementById("close-rules");
  function setRulesOpen(open){
    if(!rulesModal)return;
    rulesModal.classList.toggle("hidden-modal",!open);
    rulesModal.setAttribute("aria-hidden",String(!open));
    document.body.classList.toggle("rules-open",open);
    if(open)closeRules?.focus();else rulesToggle?.focus();
  }
  rulesToggle?.addEventListener("click",()=>setRulesOpen(true));
  closeRules?.addEventListener("click",()=>setRulesOpen(false));
  rulesModal?.addEventListener("click",event=>{if(event.target===rulesModal)setRulesOpen(false)});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&rulesModal&&!rulesModal.classList.contains("hidden-modal"))setRulesOpen(false)});
  const languageSelect=document.querySelector(".site-header .language-select");
  if(languageSelect&&window.I18n){
    languageSelect.value=window.I18n.language;
    languageSelect.addEventListener("change",()=>window.I18n.setLanguage(languageSelect.value));
    window.addEventListener("language-changed",()=>{languageSelect.value=window.I18n.language;render(state.lastStatus||boardStatus());});
  }
  window.FourfoldGardenEngine=FourfoldGardenEngine;
  document.getElementById("placeMode").addEventListener("click",function(){if(state.turnStage!=="place")return;mode="place";pending=null;engineActionIntent=null;selectedType=null;render()});
  document.getElementById("pickupMode").addEventListener("click",function(){if(state.turnStage!=="bonus"&&state.turnStage!=="pickup"&&state.turnStage!=="pickupRequired")return;mode="pickup";pending=null;engineActionIntent=null;selectedType=null;render()});
  document.getElementById("finishTurnBtn").addEventListener("click",finishBonus);
  document.getElementById("undoBtn").addEventListener("click",function(){
    if(!undoState||onlineGameId)return;
    state=undoState;undoState=null;selectedType=null;pending=null;engineActionIntent=null;mode="place";lastPoint=-1;render(resolveCapturesAndWin());
  });
  document.getElementById("resetBtn").addEventListener("click",resetGame);
  document.getElementById("modalReset").addEventListener("click",resetGame);
  document.getElementById("opponentMode").addEventListener("change",botModeChanged);
  document.getElementById("pauseBotBtn").addEventListener("click",toggleBotPause);
  renderPieceGuide();
  onlineGameId=new URLSearchParams(location.search).get("gameId");
  if(onlineGameId){state=newState();startRepetitionTracking();state.lastStatus=boardStatus();render(state.lastStatus);initOnline();}
  else{
    const requestedMode=new URLSearchParams(location.search).get("mode");
    if(["human","bot-indigo","bot-ivory","watch"].indexOf(requestedMode)>=0){opponentMode=requestedMode;document.getElementById("opponentMode").value=requestedMode;}
    resetGame();initOnline();
  }
}

})();
