importScripts("https://cdn.jsdelivr.net/pyodide/v0.21.3/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.2/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.2/dist/wheels/panel-0.14.2-py3-none-any.whl', 'pyodide-http==0.1.0', 'holoviews>=1.15.1', 'hvplot', 'numpy', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# In[74]:


import pandas as pd
import numpy as np
import panel as pn 
pn.extension('tabulator') ## extension for creating interactive tables

import hvplot.pandas # create interactive dataframes


# In[42]:


#df = pd.read_csv('https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv')


# In[75]:


# cache data to improve dashboard performance
if 'data' not in pn.state.cache.keys():

    df = pd.read_csv('https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv')

    pn.state.cache['data'] = df.copy()

else: 

    df = pn.state.cache['data']


# In[76]:


df


# In[77]:


df['year'].max()


# ## (0) Some minor data processing

# In[78]:


# Fill NAs with 0s and create GDP per capita column
df = df.fillna(0)
df['gdp_per_capita'] = np.where(df['population'] != 0, df['gdp']/df['population'], 0)


# In[79]:


# Make DataFrame Pipeline Interactive
idf = df.interactive()


# ## (1) CO2 emission over time by continent

# In[80]:


# Define Panel Widgets
year_slider = pn.widgets.IntSlider(name='Year Slider', start=1750, end=2021, step=5, value=1850)
year_slider


# In[81]:


# Radio buttons for CO2 measures
yaxis_co2 = pn.widgets.RadioButtonGroup(name='Y axis', options=['co2', 'co2_per_capita'], button_type='success')


# In[82]:


yaxis_co2


# In[83]:


continents = ['World', 'Asia', 'Oceania', 'Europe', 'Africa', 'North America', 'South America', 'Antarctica']

co2_pipeline = (
    idf[
        (idf.year <= year_slider) &
        (idf.country.isin(continents))
    ]
    .groupby(['country', 'year'])[yaxis_co2].mean()
    .to_frame()
    .reset_index()
    .sort_values('year')
    .reset_index(drop=True)
)


# In[84]:


co2_pipeline


# In[85]:


co2_plot = co2_pipeline.hvplot(x='year', by='country', y=yaxis_co2, line_width=2, title='CO2 emission by continent')
co2_plot


# ## (2) Table - CO2 emission over time by continent

# In[86]:


co2_table = co2_pipeline.pipe(pn.widgets.Tabulator, pagination='remote', page_size=10, sizing_mode='stretch_width')
co2_table


# ## (3) CO2 vs GDP scatterplot

# In[87]:


co2_vs_gdp_scatterplot_pipeline = (
    idf[
        (idf.year == year_slider) &
        (~ (idf.country.isin(continents)))
    ]
    .groupby(['country', 'year', 'gdp_per_capita'])['co2'].mean()
    .to_frame()
    .reset_index()
    .sort_values('year')
    .reset_index(drop=True)
    
)


# In[88]:


co2_vs_gdp_scatterplot_pipeline


# In[89]:


co2_vs_gdp_scatterplot = co2_vs_gdp_scatterplot_pipeline.hvplot(x='gdp_per_capita', y='co2', by='country', 
                                                                size=80, kind='scatter', alpha=0.7, 
                                                                legend=False, height=500, width=500)

co2_vs_gdp_scatterplot


# ## (4) Bar chart with CO2 sources by continent

# In[90]:


yaxis_co2_source = pn.widgets.RadioButtonGroup(name='Y axis', options=['coal_co2', 'oil_co2', 'gas_co2'], button_type='success')
yaxis_co2_source


# In[91]:


continents_excl_world = ['Asia', 'Oceania', 'Europe', 'Africa', 'North America', 'South America', 'Antarctica']
co2_source_bar_pipeline = (
    idf[
        (idf.year == year_slider) &
        (idf.country.isin(continents_excl_world))
    ]
    .groupby(['country', 'year'])[yaxis_co2_source].sum()
    .to_frame()
    .reset_index()
    .sort_values('year')
    .reset_index(drop=True)
)


# In[92]:


co2_source_bar_pipeline


# In[93]:


co2_source_bar_plot = co2_source_bar_pipeline.hvplot(kind='bar', x='country', y=yaxis_co2_source, title='CO2 source by continent')
co2_source_bar_plot


# ## Creating Dashboard

# In[94]:


# Layout using Template
template = pn.template.FastListTemplate(
    title='World CO2 Emission Dashboard',
    sidebar=[pn.pane.Markdown('# CO2 Emissions and Climate Change'),
             pn.pane.Markdown('#### Carbon dioxide emissions are the primary driver of global climate change. It’s widely recognised that to avoid the worst impacts of climate change, the world needs to urgently reduce emissions. But, how this responsibility is shared between regions, countries, and individuals has been an endless point of contention in international discussions.'),
             #pn.pane.PNG('./climate_day.png', sizing_mode='scale_both'),
             pn.pane.Markdown('# Settings'),
             year_slider],
    main=[pn.Row(pn.Column(yaxis_co2, co2_plot.panel(width=700), margin=(0,25)),
                 co2_table.panel(width=500)),
          pn.Row(pn.Column(co2_vs_gdp_scatterplot.panel(width=600), margin=(0,25)), 
                 pn.Column(yaxis_co2_source, co2_source_bar_plot.panel(width=600)))],
    accent_base_color = '#88d8b0',
    header_background = '#88b8d0'
)

#template.show()
template.servable();            



await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()