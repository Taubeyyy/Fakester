    const initializeApp = async (user, isGuest = false) => {
        localStorage.removeItem('fakesterGame');
        setLoading(true);
        if (isGuest) {
            currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
            userProfile = { xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0 };
            userUnlockedAchievementIds = [];
        } else {
            currentUser = { id: user.id, username: user.user_metadata.username, isGuest };
            
            // Lade Profildaten
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            
            if (profileError) {
                console.error("Profil-Ladefehler:", profileError);
                showToast("Fehler beim Laden deines Profils.", true);
                userProfile = { xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0 };
            } else {
                userProfile = profile;
            }

            // Lade Erfolge (HIER IST DIE KORREKTUR)
            const { data: achievements, error: achError } = await supabase
                .from('user_achievements')
                .select('achievement_id') 
                .eq('user_id', user.id); // <-- VON 'id' ZU 'user_id' GEÄNDERT

            if (achError) {
                console.error("Erfolg-Ladefehler:", achError);
                userUnlockedAchievementIds = [];
            } else {
                // Das 'map' ist wichtig, falls 'achievement_id' vom Typ 'text' ist
                userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10));
            }

            await checkSpotifyStatus(); 
            renderAchievements(); 
            renderTitles();
            renderIcons();
            renderLevelProgress(); 
            updateStatsDisplay();
            
            equipTitle(userProfile.equipped_title_id || 1);
            equipIcon(userProfile.equipped_icon_id || 1);
            updatePlayerProgress(0, false); 
        }

        document.body.classList.toggle('is-guest', isGuest);
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        showScreen('home-screen');
        connectWebSocket();
        setLoading(false); // Dies wird jetzt erreicht!
    };
