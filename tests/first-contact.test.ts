import { describe, expect, it } from 'vitest';
import { SceneController } from '../src/scenes/controller';
import { Keyboard } from '../src/input/keyboard';
import { PlayerInputs } from '../src/input/sources';
import { currentLesson, tutorialInstruction } from '../src/game/tutorial';
import { predictTrajectory } from '../src/game/trajectory';
import { createGame, retryGame, skipTeachingStep, stepGame, togglePause } from '../src/game/game';
import { firstContact } from '../src/levels/first-contact';
import { createControls, NO_CONTROLS } from '../src/input/intent';
import { scenes as registry } from '../src/scenes/registry';
import { chapterChoices } from '../src/render/scene-ui';
import { integrate } from '../src/physics/world';
import { length, sub } from '../src/physics/vector';

function prepareExit(p1: number, p2: number) {
    const scenes = new SceneController(); scenes.enter('tutorial_part_1');
    const keyboard = new Keyboard(() => {}), input = new PlayerInputs([keyboard.source(0), keyboard.source(1)]);
    const frames = (n: number) => { for (let i = 0; i < n; i++) scenes.step(input.read()); };
    const tap = (key: string) => { keyboard.keyDown(key); keyboard.keyUp(key); };
    expect(scenes.game!.phase).toBe('ready');
    expect(tutorialInstruction(scenes.game!)).toContain('人类最后的飞船');
    scenes.toggle();
    scenes.toggle(); // Dismiss movement prompt, remain ready.
    keyboard.keyDown('KeyD'); frames(p1); keyboard.keyUp('KeyD'); frames(60);
    expect(currentLesson(scenes.game!)!.id).toBe('enable-p1');
    scenes.toggle(); tap('KeyF'); frames(30); expect(currentLesson(scenes.game!)!.id).toBe('observe-p1');
    scenes.toggle();
    for (let i = 0; i < 300 && currentLesson(scenes.game!)!.id === 'observe-p1'; i++) frames(1);
    expect(currentLesson(scenes.game!)!.id).toBe('move-p2'); expect(scenes.game!.phase).toBe('paused');
    expect(scenes.game!.bodies[0].velocity.y).toBeLessThan(0);
    scenes.toggle(); keyboard.keyDown('ArrowRight'); frames(p2); keyboard.keyUp('ArrowRight'); frames(60);
    expect(currentLesson(scenes.game!)!.id).toBe('enable-p2');
    scenes.toggle(); tap('Enter'); frames(30); expect(currentLesson(scenes.game!)!.id).toBe('combine');
    scenes.toggle();
    for (let i = 0; i < 300 && currentLesson(scenes.game!)!.id === 'combine'; i++) frames(1);
    expect(currentLesson(scenes.game!)!.id).toBe('exit'); expect(scenes.game!.phase).toBe('paused');
    const visited = [...scenes.game!.tutorial!.visited];
    tap('KeyF'); tap('Enter'); frames(30);
    return { scenes, frames, visited };
}

describe('First Contact keyboard route', () => {
  const routes = [6, 8, 10, 12, 14].flatMap(p1 => [6, 8, 10, 12, 14].map(p2 => ({ p1, p2 })));
  it.each(routes)('completes with independent repositioning durations $p1 / $p2 ticks', ({p1, p2}) => {
    const { scenes, frames, visited } = prepareExit(p1, p2);
    const prediction = predictTrajectory(scenes.game!);
    expect(prediction.outcome).toBe('transition');
    scenes.toggle();
    for (let i = 0; i < 3000 && scenes.scene === 'tutorial_part_1' && scenes.game!.phase === 'running'; i++) frames(1);
    expect(scenes.scene).toBe('tutorial_part_2');
    expect(scenes.game!.level.id).toBe('moving-world'); expect(scenes.game!.phase).toBe('ready'); expect(scenes.arrival!.seconds).toBeGreaterThan(1.3);
    expect(visited).toEqual(['intro', 'move-p1', 'enable-p1', 'observe-p1', 'move-p2', 'enable-p2', 'combine', 'exit']);
  });
  it('can recover a failed final stage and still finish from its unchanged physical checkpoint', () => {
    const { scenes, frames } = prepareExit(10, 10);
    // Fail/retry from the current stage: fixture injection only for the failure,
    // then the original physical checkpoint must still complete without editing the ship.
    const checkpoint = structuredClone(scenes.game!.checkpoint!.snapshot);
    scenes.game!.bodies[0].position.x = scenes.game!.level.missionBounds!.maxX + 10;
    scenes.toggle(); frames(1); expect(scenes.game!.phase).toBe('failed');
    scenes.retry(); expect(currentLesson(scenes.game!)!.id).toBe('exit');
    expect(scenes.game!.bodies).toEqual(checkpoint.bodies);
    expect(scenes.game!.players.every(p => !p.active)).toBe(true);
    expect(predictTrajectory(scenes.game!).outcome).toBe('transition');
    scenes.toggle();
    for (let i = 0; i < 3000 && scenes.scene === 'tutorial_part_1' && scenes.game!.phase === 'running'; i++) frames(1);
    expect(scenes.scene).toBe('tutorial_part_2');
    expect(scenes.game!.level.id).toBe('moving-world'); expect(scenes.arrival!.seconds).toBeGreaterThan(1.3);
  });
});

describe('teaching safety and real physical effects', () => {
  it('starts with a nonzero ship velocity, one story prompt and no celestial obstacles', () => {
    const game = createGame(firstContact), original = structuredClone(game.bodies);
    for (let i = 0; i < 120; i++) stepGame(game, NO_CONTROLS);
    expect(game.bodies).toEqual(original); expect(game.elapsed).toBe(0);
    expect(game.bodies.map(b => b.kind)).toEqual(['ship', 'wormhole']);
    expect(game.bodies[0].velocity.x).toBe(45);
    expect(currentLesson(game)!.id).toBe('intro');
    togglePause(game); expect(currentLesson(game)!.id).toBe('move-p1'); expect(game.phase).toBe('ready');
  });

  it('both fields actually bend the ship and their combined impulse differs from either alone', () => {
    const velocities = [[false,false], [true,false], [false,true], [true,true]].map(fields => {
      const game = createGame(firstContact);
      game.players.forEach((p,i) => { p.active = fields[i]; });
      for (let i = 0; i < 39; i++) integrate(game.bodies, game.players, 1/60);
      return game.bodies[0].velocity;
    });
    expect(velocities[0]).toEqual({ x:45, y:0 });
    expect(velocities[1].y).toBeLessThan(-3); expect(velocities[2].y).toBeLessThan(-3);
    expect(length(sub(velocities[3], velocities[1]))).toBeGreaterThan(3);
    expect(length(sub(velocities[3], velocities[2]))).toBeGreaterThan(3);
  });

  it('never counts a paused preview or a remote enabled field as observed flight', () => {
    const game = createGame(firstContact);
    for (let i = 0; i < 3; i++) skipTeachingStep(game);
    expect(currentLesson(game)!.id).toBe('observe-p1');
    const on = createControls({ abilityActive: true });
    for (let i = 0; i < 120; i++) stepGame(game,on);
    expect(game.tutorial!.effectiveSeconds).toBe(0);
    const before = structuredClone(game); predictTrajectory(game); expect(game).toEqual(before);
    game.players[0].position = { x: -5000, y: -5000 }; // remote-force test fixture
    togglePause(game); for (let i = 0; i < 120; i++) stepGame(game,on);
    expect(game.tutorial!.effectiveSeconds).toBe(0); expect(currentLesson(game)!.id).toBe('observe-p1');
    expect(game.bodies[0].velocity).toEqual({x:45,y:0});
  });

  it('fails without intervention and restores the current teaching stage and physical checkpoint', () => {
    const game = createGame(firstContact); togglePause(game); togglePause(game); togglePause(game);
    const checkpoint = structuredClone(game.checkpoint!.snapshot);
    for (let i = 0; i < 4000 && game.phase === 'running'; i++) stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed'); expect(game.pendingScene).toBeUndefined();
    expect(tutorialInstruction(game)).toContain('按 R');
    const retry = retryGame(game);
    expect(currentLesson(retry)!.id).toBe('move-p1'); expect(retry.phase).toBe('ready');
    expect(retry.bodies).toEqual(checkpoint.bodies); expect(retry.tutorial).toEqual(checkpoint.tutorial);
    expect(retry.elapsed).toBe(checkpoint.elapsed);
  });

  it('debug skip changes only lesson state and never fabricates physical arrival', () => {
    const game = createGame(firstContact), bodies = structuredClone(game.bodies);
    for (let i = 0; i < 12; i++) skipTeachingStep(game);
    expect(currentLesson(game)!.id).toBe('exit'); expect(game.pendingScene).toBeUndefined();
    expect(game.phase).toBe('ready'); expect(game.bodies).toEqual(bodies);
    expect(predictTrajectory(game).outcome).not.toBe('transition');
  });

  it('accepts genuine high-speed early entry without forcing tutorial button checks', () => {
    const config = structuredClone(registry), level = config.tutorial_part_1.level!;
    level.bodies[0].position = { x: 560, y: 80 }; level.bodies[0].velocity = { x: 240, y: 0 }; // alternate spawn fixture
    const scenes = new SceneController(config); scenes.enter('tutorial_part_1'); scenes.toggle(); scenes.toggle(); scenes.toggle();
    for (let i = 0; i < 60 && scenes.scene === 'tutorial_part_1'; i++) scenes.step(NO_CONTROLS);
    expect(scenes.scene).toBe('tutorial_part_2'); expect(scenes.arrival!.seconds).toBeLessThan(1);
    expect(scenes.game!.level.id).toBe('moving-world'); const arrival = structuredClone(scenes.arrival);
    scenes.step(NO_CONTROLS); scenes.toggle(); expect(scenes.arrival).toEqual(arrival);
  });

  it('offers both tutorial parts and allows an independent first-part replay', () => {
    const choices = chapterChoices(registry);
    expect(choices.filter(c => c.playable).map(c => c.id)).toEqual(['tutorial_part_1','prototype','tutorial_part_2']);
    expect(choices.find(c => c.id === 'tutorial_part_2')!.playable).toBe(true);
    const scenes = new SceneController(); scenes.enter('tutorial_part_2'); expect(scenes.game!.level.id).toBe('moving-world');
    scenes.enter('tutorial_part_1'); expect(scenes.game).toEqual(createGame(firstContact)); expect(scenes.arrival).toBeUndefined();
  });
});
