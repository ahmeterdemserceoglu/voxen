import test from 'node:test';
import assert from 'node:assert/strict';
import { useSocialStore } from '../src/store/socialStore.ts';
import type { UserSummary } from '../src/models/User.ts';

test('Social Store - follow, unfollow, and duplicate prevention', () => {
  const store = useSocialStore.getState();

  // Reset store
  useSocialStore.setState({ followingUsers: [] });

  const user1: UserSummary = {
    uid: 'user-123',
    displayName: 'Test User',
    username: 'testuser',
  };

  const user2: UserSummary = {
    uid: 'user-456',
    displayName: 'Another User',
    username: 'another',
  };

  // 1. Initial state
  assert.equal(useSocialStore.getState().isFollowingUser('user-123'), false);

  // 2. Follow user1
  useSocialStore.getState().followUser(user1);
  assert.equal(useSocialStore.getState().followingUsers.length, 1);
  assert.equal(useSocialStore.getState().isFollowingUser('user-123'), true);

  // 3. Duplicate follow should not add twice
  useSocialStore.getState().followUser(user1);
  assert.equal(useSocialStore.getState().followingUsers.length, 1);

  // 4. Follow user2
  useSocialStore.getState().followUser(user2);
  assert.equal(useSocialStore.getState().followingUsers.length, 2);
  assert.equal(useSocialStore.getState().isFollowingUser('user-456'), true);

  // 5. Unfollow user1
  useSocialStore.getState().unfollowUser('user-123');
  assert.equal(useSocialStore.getState().followingUsers.length, 1);
  assert.equal(useSocialStore.getState().isFollowingUser('user-123'), false);
  assert.equal(useSocialStore.getState().isFollowingUser('user-456'), true);
});
