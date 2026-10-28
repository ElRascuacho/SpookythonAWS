import { expect, test } from 'bun:test';
import { initialProgress, rewardWin, purchase, ProgressSchema } from '../arcadeProgress';
test('wins grant coins and milestone bonuses only once; purchases charge only once', () => {
 let p = rewardWin(initialProgress());
 expect(p.coins).toBe(30);
 expect(purchase(p, 'gold')).toBe(p);
 for (let i = 1; i < 5; i++) p = rewardWin(p);
 expect(p.coins).toBe(120);
 p = purchase(p, 'gold');
 expect(p.coins).toBe(0);
 expect(p.equipped).toBe('gold');
 expect(purchase(p, 'gold').coins).toBe(0);
 expect(rewardWin(p).coins).toBe(10);
 expect(ProgressSchema.safeParse({ ...p, coins: -1 }).success).toBe(false);
 expect(ProgressSchema.safeParse({ ...initialProgress(), equipped: 'gold' }).success).toBe(false);
});

test('all milestones reward once and owned cosmetics can be switched freely', () => {
 let p = initialProgress();
 for (let i = 0; i < 10; i++) p = rewardWin(p);
 expect(p.coins).toBe(270);
 expect(rewardWin(p).coins).toBe(280);
 p = purchase(p, 'gold');
 p = purchase(p, 'neon');
 expect(p.coins).toBe(90);
 p = purchase(p, 'gold');
 expect(p.coins).toBe(90);
 expect(p.equipped).toBe('gold');
 expect(purchase(p, 'default').equipped).toBe('default');
});
