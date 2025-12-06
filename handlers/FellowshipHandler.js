import { FellowshipStorage } from '../utils/FellowshipStorage.js';

/**
 * Handle fellowship lookup autocomplete
 */
export async function handleFellowshipLookupAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();
  
  // Get all fellowships
  const fellowships = FellowshipStorage.getAllFellowships();
  
  // Filter by focused value (case-insensitive)
  const filtered = fellowships
    .filter(fellowship => 
      fellowship.name.toLowerCase().includes(focusedValue.toLowerCase())
    )
    .slice(0, 25); // Discord autocomplete limit is 25
  
  // Map to autocomplete choices
  const choices = filtered.map(fellowship => ({
    name: fellowship.name,
    value: fellowship.name,
  }));
  
  await interaction.respond(choices);
}

