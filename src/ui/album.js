import { LAMP_ON_T } from '../world.js';
import { t, getLang } from '../i18n.js';
import { store, album } from '../save.js';
import { levelOfRoom } from '../levels.js';
import SAMPLES from '../samples.json';
import { $, sleep, toast, fade } from './dom.js';

// ---- album: rooms kept to look at later ---------------------------------------------------------------
// The rooms the player kept (IndexedDB, save.js) and the sample rooms that come with the
// game, and looking at one: in photo mode over the live world (the game in progress put
// aside and brought back), or on the page of its own room.
export function setupAlbum(app) {
  const { Q, world, controls, decor, place, R, VIEW } = app;

  // keep the room as it is now (the whole level save + a picture from the current view)
  async function keepRoom({ thumb = null } = {}) {
    if (!app.game?.live || app.viewing || app.demo?.active) return false;
    const state = { ...app.game.serialize(), time: +world.time.toFixed(3) };
    const shot = thumb ?? await app.snapshot(1280);
    const ok = await album.add({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, level: place.id, at: Date.now(), thumb: shot, state });
    toast(t(ok ? 'album.saved' : 'album.failed'));
    return ok;
  }
  async function renderAlbum() {
    const wrap = $('albumCards');
    const list = await album.list();
    wrap.textContent = '';
    renderSamples();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('album.empty');
      wrap.append(p);
      return;
    }
    const fmt = new Intl.DateTimeFormat(getLang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    for (const a of list) {
      const card = document.createElement('div');
      card.className = 'card glass';
      const img = document.createElement('div');
      img.className = 'img';
      if (a.thumb) img.style.backgroundImage = `url(${a.thumb})`;
      const b = document.createElement('div');
      b.className = 'body';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${t(`level.${a.level}.name`)} · ${t(`level.${a.level}.room`)}`;
      const when = document.createElement('div');
      when.className = 'when';
      when.textContent = fmt.format(a.at);
      const acts = document.createElement('div');
      acts.className = 'acts';
      const open = document.createElement('button');
      open.className = 'btn primary';
      open.textContent = t('album.view');
      open.onclick = () => viewAlbumRoom(a);
      const del = document.createElement('button');
      del.className = 'btn';
      del.textContent = t('album.delete');
      del.onclick = () => app.confirmBox(t('album.deleteConfirm'), async () => { await album.remove(a.id); renderAlbum(); });
      acts.append(open);
      if (app.canReplay(a.state?.journal)) acts.append(timelapseButton(() => viewAlbumRoom(a, { timelapse: true })));
      acts.append(del);
      b.append(name, when, acts);
      card.append(img, b);
      wrap.append(card);
    }
  }
  function timelapseButton(fn) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = t('album.timelapse');
    b.onclick = fn;
    return b;
  }
  // the rooms that come with the game (src/samples.json): a tag instead of a date, no delete
  function renderSamples() {
    const wrap = $('sampleCards');
    wrap.textContent = '';
    for (const s of SAMPLES) {
      const card = document.createElement('div');
      card.className = 'card glass';
      const img = document.createElement('div');
      img.className = 'img';
      img.style.backgroundImage = `url(ui/sample-${s.id}.jpg)`;
      const tag = document.createElement('span');
      tag.className = 'sample';
      tag.textContent = t('album.sample');
      img.append(tag);
      const b = document.createElement('div');
      b.className = 'body';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${t(`level.${s.room}.name`)} · ${t(`level.${s.room}.room`)}`;
      const acts = document.createElement('div');
      acts.className = 'acts';
      const open = document.createElement('button');
      open.className = 'btn primary';
      open.textContent = t('album.view');
      open.onclick = () => openSample(s);
      acts.append(open);
      if (s.journal && levelOfRoom(s.room)) acts.append(timelapseButton(() => openSample(s, { timelapse: true })));
      b.append(name, acts);
      card.append(img, b);
      wrap.append(card);
    }
  }
  // a sample of this page's room opens in place like a kept room; any other is the page of
  // its room (?view=<id>; &from= brings the album back to this room's page)
  async function openSample(s, { timelapse = false } = {}) {
    if (s.room === R.id && app.game && !VIEW) {
      viewAlbumRoom({ sample: s }, { timelapse });
      return;
    }
    app.saveNow();
    await fade(true);
    location.href = `?view=${s.id}${place ? `&from=${place.id}` : ''}${timelapse ? '&timelapse' : ''}`;
  }
  // a sample's time of day (?t= wins: covers / comparisons at other times)
  const sampleTime = (s) => (Q.has('t') ? +Q.get('t') : s.time);
  // a sample in level 1's room: the finished room, then its furniture, paint, time and switches
  function applySample(s) {
    app.game.finished(app.defaultLayout, s.wall);
    if (s.layout) decor.restore(s.layout);
    world.applyTime(sampleTime(s));
    sampleSwitches(s);
  }
  // the lamps as the sample says (else: on after dark), the fire likewise — set, not
  // eased in, so the first bounce-light pass already sees them
  function sampleSwitches(s) {
    for (const l of world.fixtures.lamps) {
      l.target = s.lamps?.[l.name] ?? (sampleTime(s) >= LAMP_ON_T || l.allDay ? 1 : 0);
      l.on = l.target;
    }
    if (s.fire !== undefined) world.setFireAllowed(true, { lit: s.fire });
  }
  // swap the world's room behind a quick fade of the room (the menus stay put)
  async function swapRoom(load) {
    const cv = world.renderer.domElement;
    cv.style.opacity = '0';
    await sleep(350);
    await load();
    app.resetTimeFollow();
    world.lightingChanged({ soft: false });
    app.hud.refresh();
    setTimeout(() => { cv.style.opacity = '1'; }, 250);
  }
  // an album room in photo mode: look around, change the time, shoot; the game in
  // progress is saved first and comes back on the way out
  // timelapse: its history plays first (replay.js), then the same photo mode over it
  async function viewAlbumRoom(a, { timelapse = false } = {}) {
    if (app.viewing || !app.game) return;
    if (!a.sample && a.level !== place.id) {
      app.goLevel(a.level, { go: false, extra: `&album&open=${a.id}${timelapse ? '&timelapse' : ''}` });
      return;
    }
    // the title timelapse's half-done room isn't the player's: save only a room they played
    // (stopping the timelapse first and then saving kept its room as their save)
    const wasDemo = !!app.demo?.active;
    if (wasDemo) app.demo.stop();
    else app.saveNow();
    app.viewing = a;
    $('photoExit').dataset.i18n = 'album.back';
    $('photoExit').textContent = t('album.back');
    const load = async () => {
      if (a.sample) {
        applySample(a.sample);
        return;
      }
      try {
        await app.game.restore(a.state);
      } catch (e) {
        // kept by an older version of the level: show the finished room rather than a broken one
        console.warn('[album] could not restore this room', e);
        app.game.finished(app.defaultLayout);
        toast(t('album.broken'));
      }
      world.applyTime(a.state.time ?? place.time);
    };
    // (a sample's history is a file of its own: public/samples/, made by tools/samplejournal.mjs)
    const journal = !timelapse ? null : a.sample ? await fetch(a.sample.journal).then((r) => r.json()).catch(() => null) : a.state.journal;
    if (journal) await app.playTimelapse(journal, load);
    else await swapRoom(load);
    app.syncTimeUi();
    app.setState('photo');
    controls.enabled = false;
    await app.flyTo(a.sample?.cam ? app.pose(a.sample.cam) : app.HERO, { dur: 1.6, shift: 0 });
    controls.enabled = true;
  }
  async function leaveAlbumRoom() {
    if (!app.viewing) return;
    if (VIEW) {
      // a sample's own page: back to the game, straight onto the album
      await fade(true);
      location.href = `?album${Q.has('from') ? `&level=${Q.get('from')}` : ''}`;
      return;
    }
    app.cancelSave(); // a save queued while looking (photo-mode time) must not land on the real game
    $('photoExit').dataset.i18n = 'photo.exit';
    $('photoExit').textContent = t('photo.exit');
    app.setState('album');
    await swapRoom(async () => {
      await app.loadRoom();
      world.applyTime(store.level(place.id)?.time ?? place.start ?? place.time);
      app.game.tools.roller?.setColor(place.paints[0]);
      app.viewing = null; // saves are allowed again only once the real room is back
    });
    app.syncTimeUi();
    renderAlbum();
    await app.flyTo((c) => app.menuPose(c), { dur: 1.6, shift: app.MENU_SHIFT });
  }

  return { keepRoom, renderAlbum, viewAlbumRoom, leaveAlbumRoom, sampleTime, applySample, sampleSwitches, swapRoom };
}
