import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntakeClarifications } from '../phase14/intake_clarification.js';

const ids=(x)=>detectIntakeClarifications(x).map(q=>q.id);

test('quantified advanced planche goal asks for current skill baseline when absent',()=>{
  const out=ids({primary_goals:['Hold full planche for 5 seconds'],equipment:'Commercial gym'});
  assert.ok(out.includes('benchmark_planche'));
});

test('supplied advanced-skill benchmark prevents redundant clarification',()=>{
  const out=ids({primary_goals:['Hold full planche for 5 seconds'],current_numbers:'Advanced tuck planche 8 seconds',equipment:'Commercial gym'});
  assert.ok(!out.includes('benchmark_planche'));
});

test('limited weighted-calistenics setup asks for external load ceiling when missing',()=>{
  const out=ids({
    primary_goals:['Weighted pull-up +40 kg for 5 reps'],
    current_numbers:'Weighted pull-up +25 kg x 5',
    equipment:'Outdoor park, pull-up bar, rings and weighted belt with plates',
  });
  assert.ok(out.includes('equipment_load_ceiling'));
});

test('explicit load ceiling resolves limited-equipment ambiguity',()=>{
  const out=ids({
    primary_goals:['Weighted pull-up +40 kg for 5 reps'],
    current_numbers:'Weighted pull-up +25 kg x 5',
    equipment:'Outdoor park, pull-up bar, rings and weighted belt with up to 30 kg of plates available',
  });
  assert.ok(!out.includes('equipment_load_ceiling'));
});
