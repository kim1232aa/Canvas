import React from 'react';
import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {SpatialFrame} from '../types/graph';
import {SpatialFrameItem} from './SpatialFrameItem';
import {spatialRequestParameters} from '../utils/frontendParameters';

vi.mock('react',async importOriginal=>{
  const actual=await importOriginal<typeof import('react')>();
  return {...actual,useState:()=>[false,vi.fn()],useEffect:vi.fn()};
});

const frame:SpatialFrame={id:'frame',title:'Image',pos:{x:0,y:0},width:360,height:360,prompt:'library',negativePrompt:'',status:'success',createdAt:0,imageUrl:'https://example.com/output.png',
  params:{targetProvider:'fal',checkpoint:'custom-model',width:1024,height:768,denoise:1,batchSize:1,seedControl:'fixed',loras:[]}};
type ButtonProps={title?:string;children?:React.ReactNode;onClick?:()=>void;type?:string};
function buttons(node:React.ReactNode):React.ReactElement<ButtonProps>[] {
  return React.Children.toArray(node).flatMap(child=>{
    if (!React.isValidElement<ButtonProps>(child)) return [];
    return [...(child.type==='button' ? [child] : []),...buttons(child.props.children)];
  });
}
function renderFrame(value:SpatialFrame=frame) {
  const onUpdateFrame=vi.fn();const noop=()=>{};
  const tree=SpatialFrameItem({frame:value,isSelected:false,zoom:1,onSelect:noop,onStartDrag:noop,onUpdateFrame,onDeleteFrame:noop,onQueueFrame:noop,onOpenInspector:noop,onPreviewImage:noop,onBranchVariation:noop});
  if (!React.isValidElement(tree)) throw new Error('Expected a synchronous frame element');
  return {tree,onUpdateFrame};
}

it('explicit image-to-video action uses the displayed output as reference while retaining output and model',()=>{
  const {tree,onUpdateFrame}=renderFrame();
  expect(onUpdateFrame).not.toHaveBeenCalled();
  const action=buttons(tree).find(button=>button.props.title?.includes('Image to Video'))!;
  action.props.onClick!();
  expect(onUpdateFrame).toHaveBeenCalledExactlyOnceWith(frame.id,{mediaType:'video',referenceImageUrl:frame.imageUrl});
  expect(action.props.type).toBe('button');
  const nextFrame={...frame,...onUpdateFrame.mock.calls[0][1]};
  expect(nextFrame.imageUrl).toBe(frame.imageUrl);
  expect(nextFrame.params).toBe(frame.params);
  expect(spatialRequestParameters(nextFrame).image_url).toBe(frame.imageUrl);
  expect(renderToStaticMarkup(tree)).toContain(`src="${frame.imageUrl}"`);
});

it('rendering a preset sample or switching video mode does not opt the sample into reference input',()=>{
  const {tree,onUpdateFrame}=renderFrame({...frame,status:'idle'});
  expect(onUpdateFrame).not.toHaveBeenCalled();
  const mode=buttons(tree).find(button=>React.Children.toArray(button.props.children).includes('🎥 动态视频'))!;
  mode.props.onClick!();
  expect(onUpdateFrame).toHaveBeenCalledExactlyOnceWith(frame.id,{mediaType:'video'});
  expect(spatialRequestParameters({...frame,...onUpdateFrame.mock.calls[0][1]}).image_url).toBeUndefined();
});
