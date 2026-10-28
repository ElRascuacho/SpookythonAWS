import {test,expect} from 'bun:test';
import {createGame} from '../cureGame';
import {completeFieldMission,pendingFieldOperation} from '../fieldMissions';
test('an eligible pending minigame blocks until the actual reward has been awarded',()=>{
 const game=createGame({seed:42,scenario:'standard',patientZeroId:'N01',dailyBudget:7500});const operation={kind:'shooter' as const,nodeId:'N01'};
 expect(pendingFieldOperation(game,operation)).toEqual(operation);
 // Closing or failing a view never mutates the game or awards a reward.
 expect(pendingFieldOperation(game,operation)).toEqual(operation);
 const completed=completeFieldMission(game,'shooter','N01');expect(completed.actions[game.day]?.fieldRewards?.shooter).toBeDefined();expect(pendingFieldOperation(completed,operation)).toBeNull();
});
test('practice laboratory is eligible at the seeded hospital and only completion unlocks it',()=>{
 const game=createGame({seed:42,scenario:'standard',patientZeroId:'N04',dailyBudget:7500}),operation={kind:'lab' as const,nodeId:'N04'};
 expect(pendingFieldOperation(game,operation)).not.toBeNull();const completed=completeFieldMission(game,'lab','N04');expect(completed.research).toBeGreaterThan(game.research);expect(pendingFieldOperation(completed,operation)).toBeNull();
});
test('no lock for absent, invalid, ineligible or finished-game missions',()=>{
 const game=createGame({seed:42,scenario:'standard',patientZeroId:'N01',dailyBudget:7500});
 expect(pendingFieldOperation(game,null)).toBeNull();expect(pendingFieldOperation(game,{kind:'lab',nodeId:'N99'})).toBeNull();expect(pendingFieldOperation(game,{kind:'lab',nodeId:'N01'})).toBeNull();expect(pendingFieldOperation(game,{kind:'lab',nodeId:'N04'})).toBeNull();expect(pendingFieldOperation({...game,status:'won'},{kind:'shooter',nodeId:'N01'})).toBeNull();
});
