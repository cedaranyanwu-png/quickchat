import React from 'react';
import { useParams } from 'react-router-dom';
import ProfilePage from '../components/ProfilePage';

export default function ViewProfile(props) {
  const { username } = useParams();
  return <ProfilePage {...props} username={username} />;
}
