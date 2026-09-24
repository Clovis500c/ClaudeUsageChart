import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronQuote, taskXml, FREQUENCIES } from '../src/schedule.js';

test('cronQuote leaves plain arguments alone', () => {
  assert.equal(cronQuote('push'), 'push');
  assert.equal(cronQuote('--repo'), '--repo');
  assert.equal(cronQuote('octocat/octocat'), 'octocat/octocat');
});

test('cronQuote stops shell expansion and cron % handling', () => {
  assert.equal(cronQuote('My $HOME'), "'My $HOME'");
  assert.equal(cronQuote("it's"), "'it'\\''s'");
  assert.equal(cronQuote('100%'), '100\\%');
  assert.equal(cronQuote('`id`'), "'`id`'");
});

test('Windows task XML escapes the arguments', () => {
  const xml = taskXml(['push', '--title', 'A & "B"']);
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&quot;&quot;B&quot;&quot;'));
  assert.ok(xml.includes('<Interval>PT1H</Interval>'));
});

test('frequencies are increasing', () => {
  const ms = Object.values(FREQUENCIES).map((f) => f.ms);
  assert.deepEqual(ms, [...ms].sort((a, b) => a - b));
});
