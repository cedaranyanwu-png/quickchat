import React from 'react';

const FAB = ({ onOpenPost }) => {
  return (
    <button 
      onClick={onOpenPost}
      className="w-14 h-14 rounded-full bg-blue-700 text-white shadow-lg shadow-blue-700/40 hover:bg-blue-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer"
    >
      <i className="fa-solid fa-pen text-lg"></i>
    </button>
  );
};

export default FAB;