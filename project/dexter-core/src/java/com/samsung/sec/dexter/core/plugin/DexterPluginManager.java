/**
 * Copyright (c) 2014 Samsung Electronics, Inc.,
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
package com.samsung.sec.dexter.core.plugin;

import java.util.ArrayList;
import java.util.List;

import org.apache.log4j.Logger;

import com.google.common.base.Strings;
import com.samsung.sec.dexter.core.analyzer.AnalysisConfig;
import com.samsung.sec.dexter.core.analyzer.AnalysisResult;
import com.samsung.sec.dexter.core.analyzer.AnalysisResultFileManager;
import com.samsung.sec.dexter.core.analyzer.IDexterPluginInitializer;
import com.samsung.sec.dexter.core.checker.CheckerConfig;
import com.samsung.sec.dexter.core.config.DexterConfig;
import com.samsung.sec.dexter.core.config.IDexterHomeListener;
import com.samsung.sec.dexter.core.exception.DexterException;
import com.samsung.sec.dexter.core.exception.DexterRuntimeException;

public class DexterPluginManager implements IDexterHomeListener{
	private final static Logger LOG = Logger.getLogger(DexterPluginManager.class);

	private List<IDexterPlugin> pluginList = new ArrayList<IDexterPlugin>(0);
	private boolean isInitialized = false;
	IDexterPluginInitializer initializer;
	
	private static class DexterPluginManagerHolder {
		private final static DexterPluginManager INSTANCE = new DexterPluginManager();
	}

	public static DexterPluginManager getInstance() {
		return DexterPluginManagerHolder.INSTANCE;
	}
	
	/**
	 * @return the isInitialized
	 */
	public boolean isInitialized() {
		return isInitialized;
	}

	private DexterPluginManager() {
		DexterConfig.getInstance().addDexterHomeListener(this);
		LOG.debug("DexterPluginManager");
	}

	public void initDexterPlugins() throws DexterRuntimeException{
		assert initializer != null;
		
		this.isInitialized = false;
		pluginList = new ArrayList<IDexterPlugin>(0);
		
		initializer.init(pluginList);
		initSupportingFileExetensions();
		this.isInitialized = true;
		LOG.info("Dexter plug-ins initialized successfully");
	}
	
	private void initSupportingFileExetensions() {
		DexterConfig.getInstance().removeAllSupportingFileExtensions();
		for(IDexterPlugin plugin : pluginList){
			DexterConfig.getInstance().addSupprotingFileExtensions(plugin.getSupportingFileExtensions());
		}
    }

	public void destroy() throws DexterException {
		DexterConfig.getInstance().removeDexterHomeListener(this);
		for(IDexterPlugin plugin : this.pluginList){
			plugin.destroy();
		}
		
		pluginList.clear();
    }
	
	public void destroy(final String pluginName) throws DexterException{
		for (int i=0; i< pluginList.size(); i++) {
			final IDexterPlugin plugin = pluginList.get(i);
			
			if (pluginName.equals(plugin.getDexterPluginDescription().getPluginName())) {
				plugin.destroy();
				pluginList.remove(i);
				return;
			}
		}
	}
	
	public List<AnalysisResult> analyze(AnalysisConfig config){
		List<AnalysisResult> resultList = new ArrayList<AnalysisResult>();
		
	    for (final IDexterPlugin plugin : DexterPluginManager.getInstance().getPluginList()) {
			if (plugin.supportLanguage(config.getLanguageEnum())) {
				try {
					resultList.add(plugin.analyze(config));
				} catch (IllegalStateException ie) {
					LOG.error("Exception on analyzing: " + config.getSourceFileFullPath(), ie);
				} catch (NullPointerException ne) {
					LOG.error("Exception on analyzing: " + config.getSourceFileFullPath(), ne);
				}
			}
		}
	    
	    AnalysisResultFileManager.getInstance().writeJson(resultList);
	    
	    return resultList;
    }
	
	public CheckerConfig getCheckerConfig(final String pluginName){
		if(Strings.isNullOrEmpty(pluginName)){
			LOG.error("Invalid Parameter : pluginName is null or empty");
			return null;
		}
		
		if(isInitialized == false){
			LOG.error("Invalid status : isInitialized is false");
			return null;
		}
		
		for (final IDexterPlugin plugin : pluginList) {
			if (pluginName.equals(plugin.getDexterPluginDescription().getPluginName())) {
				final CheckerConfig cc = plugin.getCheckerConfig();
				return cc;
			}
		}

		throw new DexterRuntimeException("there is no proper Checker Config info for " + pluginName);
	}

	/**
	 * @param pluginName
	 * @param config
	 *            void
	 */
	public void setCheckerConfig(final String pluginName, final CheckerConfig config) {
		assert !Strings.isNullOrEmpty(pluginName);
		assert config != null;
		
		if(isInitialized == false){
			throw new DexterRuntimeException("Invalid status : isInitialized is false");
		}
		
		for (final IDexterPlugin plugin : this.pluginList) {
			if (plugin.getDexterPluginDescription().getPluginName().equals(pluginName)) {
				plugin.setCheckerConfig(config);
			}
		}
	}

	public List<PluginDescription> getPluginDescriptionList() {
		if(isInitialized == false){
			LOG.error("Invalid status : isInitialized is false");
			return new ArrayList<PluginDescription>(0);
		}
		
		final List<PluginDescription> pdList = new ArrayList<PluginDescription>(pluginList.size());

		for (final IDexterPlugin plugin : pluginList) {
			if (plugin == null) {
				LOG.error("IDexterPlugin object is null.");
				continue;
			}

			final PluginDescription realPd = plugin.getDexterPluginDescription();
			if (realPd != null && realPd.isActive()) {
				pdList.add(realPd);
			}
		}

		return pdList;
	}

	/**
	 * @return List<IDexterPlugin>
	 */
	public List<IDexterPlugin> getPluginList() {
		if(isInitialized == false){
			LOG.warn("There is no static analysis plug-ins to execute. check your plug-ins or login status");
			return new ArrayList<IDexterPlugin>(0);
		}
		
		return pluginList;
	}

	public void runDexterHomeChangeHandler(String oldPath, String newPath) throws DexterException {
		for(IDexterPlugin plugin : this.pluginList){
			plugin.handleDexterHomeChanged(oldPath, newPath);
		}
    }

	public void setDexterPluginInitializer(IDexterPluginInitializer initializer) {
		this.initializer = initializer;
    }

	@Override
    public void handleDexterHomeChanged() {
		initDexterPlugins();
    }
}
